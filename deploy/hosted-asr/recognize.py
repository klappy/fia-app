"""One offline pilot candidate; no HTTP listener, accepted timing or hosted authority."""
import argparse
import dataclasses
import inspect
import platform
import hashlib
import importlib.metadata
import io
import json
import os
from pathlib import Path
import signal

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
PROPOSAL = json.loads(Path(__file__).with_name('proposal.json').read_text())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    def normalize(item):
        if isinstance(item, float) and item.is_integer():
            return int(item)
        if isinstance(item, dict):
            return {key: normalize(value) for key, value in item.items()}
        if isinstance(item, (list, tuple)):
            return [normalize(value) for value in item]
        return item
    return json.dumps(normalize(value), sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def validate_input(job):
    if not isinstance(job, dict) or set(job) != {'sourcePath', 'sourceSha256', 'sourceBytes'}:
        raise ValueError('invalid-pilot-input')
    if job['sourceSha256'] != PROPOSAL['source']['sha256'] or type(job['sourceBytes']) is not int or job['sourceBytes'] != PROPOSAL['source']['bytes']:
        raise ValueError('unapproved-pilot-source')
    if job['sourcePath'] != '/input/source.mp3':
        raise ValueError('fixed-source-path-required')


def encode_result(segments, samples, pcm_sha256, runtime, transcribe_options):
    # This pure serializer is exercised across the real JS contract without ASR.
    effective = {**PROPOSAL['recognition'], 'modelId': PROPOSAL['model']['name'],
                 'modelRevision': PROPOSAL['model']['revision'],
                 'transcribeOptions': transcribe_options}
    if len(segments) > 2000 or sum(len(s['words']) for s in segments) > 2000:
        raise ValueError('word-output-limit')
    result = {'schema': 'fia-hosted-raw-recognition@1', 'status': 'candidate',
              'source': PROPOSAL['source'], 'modelSha256': sha(canonical(PROPOSAL['model'])),
              'runtimeSha256': sha(canonical(runtime)), 'scriptSha256': sha(Path(__file__).read_bytes()),
              'configSha256': sha(canonical(effective)), 'effectiveConfig': effective,
              'decoder': {'samples': samples, 'sampleRate': 16000, 'sha256': pcm_sha256},
              'durationSeconds': samples / 16000, 'segments': segments,
              'text': ''.join(s['text'] for s in segments),
              'uncertainty': ['Raw recognition and estimated word times remain uncalibrated candidates.',
                              'No alignment, native browser clock, accepted ranges or highlighting qualification is implied.']}
    encoded = canonical(result)
    if len(encoded) > 1048576:
        raise ValueError('serialized-output-limit')
    return encoded


def run(job):
    validate_input(job)
    with open(job['sourcePath'], 'rb') as handle:
        raw = handle.read(job['sourceBytes'] + 1)
    if len(raw) != job['sourceBytes'] or sha(raw) != job['sourceSha256']:
        raise ValueError('source-identity')
    model = Path('/opt/model')
    if sorted(p.name for p in model.iterdir()) != sorted(f['path'] for f in PROPOSAL['model']['files']):
        raise ValueError('model-file-set')
    for entry in PROPOSAL['model']['files']:
        path = model / entry['path']
        if path.is_symlink() or path.stat().st_size != entry['bytes']:
            raise ValueError('model-file-size')
        h = hashlib.sha256()
        with path.open('rb') as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                h.update(chunk)
        if h.hexdigest() != entry['sha256']:
            raise ValueError('model-file-hash')
    import av
    import numpy as np
    from faster_whisper import WhisperModel
    with av.open(io.BytesIO(raw)) as container:
        if len(container.streams.audio) != 1:
            raise ValueError('audio-stream-count')
        resampler = av.AudioResampler(format='fltp', layout='mono', rate=16000)
        chunks, total = [], 0
        def retain(frame):
            nonlocal total
            samples = frame.to_ndarray().reshape(-1)
            total += len(samples)
            if total > 90 * 16000:
                raise ValueError('decoded-duration-limit')
            chunks.append(samples)
        for frame in container.decode(audio=0):
            for output in resampler.resample(frame):
                retain(output)
        for output in resampler.resample(None):
            retain(output)
        if total == 0:
            raise ValueError('empty-audio')
        pcm = np.concatenate(chunks).astype(np.float32)
    recognizer = WhisperModel(str(model), device='cpu', compute_type='int8', cpu_threads=2, num_workers=1, local_files_only=True)
    options = {'language': 'en', 'task': 'transcribe', 'beam_size': 5,
               'word_timestamps': True, 'initial_prompt': None, 'prefix': None,
               'hotwords': None, 'condition_on_previous_text': False, 'vad_filter': False}
    effective_options = {key: value.default for key, value in inspect.signature(recognizer.transcribe).parameters.items()
                         if key != 'audio'}
    locked_defaults = json.loads(Path(__file__).with_name('transcribe-defaults.json').read_text())
    if canonical(effective_options) != canonical(locked_defaults):
        raise ValueError('transcribe-defaults-drift')
    effective_options.update(options)
    segments, _ = recognizer.transcribe(pcm, **options)
    rows, count = [], 0
    for segment in segments:
        row = dataclasses.asdict(segment)
        if row['words'] is None:
            raise ValueError('missing-raw-word-evidence')
        count += len(row['words'])
        if count > 2000 or len(rows) >= 2000:
            raise ValueError('word-output-limit')
        rows.append(row)
    runtime = {'python': platform.python_version(), 'packages': {
        name: importlib.metadata.version(name) for name in ['faster-whisper', 'ctranslate2', 'av', 'numpy']}}
    return encode_result(rows, total, sha(pcm.tobytes()), runtime, effective_options)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError('pilot-300s-limit')))
    signal.alarm(300)
    with open(args.input, 'rb') as handle:
        data = handle.read(16385)
    if len(data) > 16384:
        raise ValueError('input-limit')
    result = run(json.loads(data))
    with open(args.output, 'xb') as handle:
        handle.write(result)
    signal.alarm(0)
    print(json.dumps({'status': 'candidate', 'sha256': sha(result), 'bytes': len(result)}))


if __name__ == '__main__':
    main()
