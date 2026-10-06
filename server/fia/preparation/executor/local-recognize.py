"""Offline development/reference recognizer. Not a hosted production adapter."""
import argparse
import dataclasses
import hashlib
import importlib.metadata
import inspect
import io
import json
import os
from pathlib import Path
import platform
import re
import signal
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'


def digest(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def recognize(job, model_directory):
    if not isinstance(job, dict) or set(job) != {'sourcePath', 'sourceSha256', 'sourceBytes', 'language', 'modelId', 'modelManifestSha256', 'runtimeManifestSha256'}:
        raise ValueError('invalid-local-recognition-input')
    for field in ['sourceSha256', 'modelManifestSha256', 'runtimeManifestSha256']:
        if not isinstance(job[field], str) or not re.fullmatch('[0-9a-f]{64}', job[field]):
            raise ValueError('missing-input-identity')
    if type(job['sourceBytes']) is not int or not 0 < job['sourceBytes'] <= 2 * 1024 * 1024:
        raise ValueError('source-limit')
    if not isinstance(job['language'], str) or not re.fullmatch('[a-z]{2}', job['language']) or not isinstance(job['modelId'], str) or not job['modelId'].strip():
        raise ValueError('invalid-model-language')
    if not isinstance(job['sourcePath'], str) or not job['sourcePath']:
        raise ValueError('invalid-source-path')
    source = Path(job['sourcePath'])
    if source.stat().st_size != job['sourceBytes']:
        raise ValueError('source-length')
    raw = source.read_bytes()
    if digest(raw) != job['sourceSha256']:
        raise ValueError('source-hash')
    model_path = Path(model_directory)
    model_files = {p.name: {'sha256': digest(p.read_bytes()), 'bytes': p.stat().st_size}
                   for p in sorted(model_path.iterdir()) if p.is_file()}
    if not model_files or digest(canonical(model_files)) != job['modelManifestSha256']:
        raise ValueError('model-manifest-hash')
    runtime = {'python': platform.python_version(), **{
        key: importlib.metadata.version(key) for key in ['faster-whisper', 'ctranslate2', 'av', 'numpy']}}
    if digest(canonical(runtime)) != job['runtimeManifestSha256']:
        raise ValueError('runtime-manifest-hash')
    import av
    import numpy as np
    from faster_whisper import WhisperModel
    model = WhisperModel(str(model_path), device='cpu', compute_type='int8',
                         cpu_threads=4, local_files_only=True)
    # Decode the bytes that were hashed, even if the source path changes later.
    with av.open(io.BytesIO(raw)) as container:
        if len(container.streams.audio) != 1:
            raise ValueError('ambiguous-audio-stream')
        resampler = av.AudioResampler(format='fltp', layout='mono', rate=16000)
        chunks, total = [], 0
        for frame in container.decode(audio=0):
            for output in resampler.resample(frame):
                samples = output.to_ndarray().reshape(-1)
                total += len(samples)
                if total > 600 * 16000:
                    raise ValueError('decoded-duration-limit')
                chunks.append(samples)
        for output in resampler.resample(None):
            samples = output.to_ndarray().reshape(-1)
            total += len(samples)
            if total > 600 * 16000:
                raise ValueError('decoded-duration-limit')
            chunks.append(samples)
        if not chunks:
            raise ValueError('empty-audio')
        pcm = np.concatenate(chunks).astype(np.float32)
    options = {'language': job['language'], 'task': 'transcribe', 'beam_size': 5,
               'word_timestamps': True, 'condition_on_previous_text': False,
               'initial_prompt': None, 'prefix': None, 'hotwords': None, 'vad_filter': False}
    effective = {key: value.default for key, value in inspect.signature(model.transcribe).parameters.items()
                 if key != 'audio'}
    effective.update(options)
    segments, _info = model.transcribe(pcm, **options)
    rows = [dataclasses.asdict(segment) for segment in segments]
    return {
        'schema': 'fia-local-raw-recognition@1', 'status': 'candidate',
        'executionClass': 'local-offline-development-reference',
        'source': {'sha256': digest(raw), 'bytes': len(raw)},
        'model': {'id': job['modelId'], 'manifestSha256': job['modelManifestSha256'],
                  'files': model_files, 'device': 'cpu', 'computeType': 'int8', 'cpuThreads': 4},
        'runtime': runtime,
        'recognitionConfig': effective,
        'decoder': {'library': 'PyAV', 'format': 'mono float32 16000Hz',
                    'samples': len(pcm), 'sha256': digest(pcm.tobytes()),
                    'clockDomain': 'decoded-source-samples'},
        'durationSeconds': len(pcm) / 16000, 'segments': rows,
        'text': ''.join(segment['text'] for segment in rows),
        'scriptSha256': digest(Path(__file__).read_bytes()),
        'limits': ['Model word timestamps are estimates, not accepted playback boundaries.',
                   'No hosted execution, calibrated confidence or browser clock acceptance is implied.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--model-dir', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError('local-ASR-120s-limit')))
    signal.alarm(120)
    with Path(args.input).open('rb') as source:
        job_bytes = source.read(16385)
    if len(job_bytes) > 16384:
        raise ValueError('input-limit')
    started = time.monotonic()
    result = recognize(json.loads(job_bytes), args.model_dir)
    result['elapsedSeconds'] = time.monotonic() - started
    body = canonical(result)
    with Path(args.output).open('xb') as output:
        output.write(body)
    signal.alarm(0)
    print(json.dumps({'status': 'candidate', 'executionClass': result['executionClass'],
                      'sha256': digest(body), 'bytes': len(body),
                      'wordCount': sum(len(s['words']) for s in result['segments'])}))


if __name__ == '__main__':
    main()
