"""Bounded, offline-only PCM decode and single-window recognition process."""
import argparse
from contextlib import ExitStack
import dataclasses
import hashlib
import importlib.metadata
import io
import json
import math
import os
from pathlib import Path
import platform
import signal

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'

def canonical(v):
    return json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()

def digest(b):
    return hashlib.sha256(b).hexdigest()

def file_digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()

def runtime():
    return {'python': platform.python_version(), **{k: importlib.metadata.version(k) for k in ['av', 'numpy', 'faster-whisper', 'ctranslate2']}}

def need(ok, reason):
    if not ok:
        raise ValueError(reason)

def decode(job):
    import av
    import numpy as np
    source = Path(job['sourcePath'])
    spooled = job['mode'] == 'decode-spooled'
    source_limit = job.get('maxSourceBytes', 2 * 1024 * 1024) if spooled else 8 * 1024 * 1024
    need(type(source_limit) is int and 0 < source_limit <= 16 * 1024 * 1024, 'source-budget')
    need(type(job['sourceBytes']) is int and 0 < job['sourceBytes'] <= source_limit, 'source-budget')
    need(source.stat().st_size == job['sourceBytes'], 'source-length')
    limit = job['maxSamples']
    need(type(limit) is int and 0 < limit <= 16000 * 86400, 'pcm-budget')
    total, h = 0, hashlib.sha256()
    with ExitStack() as stack:
        if spooled:
            # The caller owns this private completed spool. Verify incrementally
            # on the same descriptor passed to PyAV; never materialize the source.
            input_stream = stack.enter_context(source.open('rb'))
            source_hash, source_count = hashlib.sha256(), 0
            for chunk in iter(lambda: input_stream.read(65536), b''):
                source_count += len(chunk)
                need(source_count <= job['sourceBytes'] and source_count <= source_limit, 'source-budget')
                source_hash.update(chunk)
            need(source_count == job['sourceBytes'] and source_hash.hexdigest() == job['sourceSha256'], 'source-hash')
            input_stream.seek(0)
        else:
            with source.open('rb') as f:
                raw = f.read(8 * 1024 * 1024 + 1)
            need(len(raw) == job['sourceBytes'] and digest(raw) == job['sourceSha256'], 'source-hash')
            input_stream = io.BytesIO(raw)
        container = stack.enter_context(av.open(input_stream))
        out = stack.enter_context(open(job['pcmPath'], 'xb'))
        need(len(container.streams.audio) == 1, 'audio-stream-count')
        resampler = av.AudioResampler(format='fltp', layout='mono', rate=16000)
        def emit(frame):
            nonlocal total
            samples = frame.to_ndarray().reshape(-1).astype('<f4')
            need(np.isfinite(samples).all(), 'nonfinite-pcm')
            total += len(samples)
            need(total <= limit, 'pcm-budget')
            b = samples.tobytes()
            h.update(b)
            out.write(b)
        for frame in container.decode(audio=0):
            for output in resampler.resample(frame):
                emit(output)
        for output in resampler.resample(None):
            emit(output)
    need(total > 0, 'empty-pcm')
    return {'schema': 'fia-local-window-pcm@1', 'sourceSha256': job['sourceSha256'], 'sourceBytes': job['sourceBytes'], 'pcmSha256': h.hexdigest(), 'totalSamples': total, 'sampleRate': 16000, 'format': 'mono-f32le', 'decoderSha256': job['decoderSha256']}

def recognize(job):
    import numpy as np
    from faster_whisper import WhisperModel
    p, w = job['planIdentity'], job['window']
    need(p['sampleRate'] == 16000 and 0 < p['totalSamples'] <= job['maxSamples'], 'pcm-budget')
    path = Path(job['pcmPath'])
    need(path.stat().st_size == p['totalSamples'] * 4, 'pcm-length')
    start, end = w['startSample'], w['endSampleExclusive']
    need(type(start) is int and type(end) is int and 0 <= start < end <= p['totalSamples'] and end - start <= 600 * 16000, 'window-bounds')
    model_path = Path(job['modelDirectory'])
    files = {p.name: {'bytes': p.stat().st_size, 'sha256': file_digest(p)} for p in sorted(model_path.iterdir()) if p.is_file()}
    need(files and digest(canonical(files)) == p['modelSha256'], 'model-manifest')
    # Hash and extract from the same read sequence. Never reopen after verifying:
    # the selected bytes are exactly part of the complete PCM digest we accept.
    with path.open('rb') as f:
        h, position, selected = hashlib.sha256(), 0, bytearray()
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            need(position + len(chunk) <= p['totalSamples'] * 4, 'pcm-budget')
            h.update(chunk)
            a, b = max(start * 4 - position, 0), min(end * 4 - position, len(chunk))
            if a < b:
                selected.extend(chunk[a:b])
            position += len(chunk)
        need(position == p['totalSamples'] * 4 and h.hexdigest() == p['pcmSha256'], 'pcm-binding')
        pcm = np.frombuffer(selected, dtype='<f4').copy()
    need(len(pcm) == end - start and np.isfinite(pcm).all(), 'window-pcm')
    model = WhisperModel(str(model_path), device='cpu', compute_type='int8', cpu_threads=4, local_files_only=True)
    options = {'language': job['language'], 'task': 'transcribe', 'beam_size': 5, 'word_timestamps': True, 'condition_on_previous_text': False, 'initial_prompt': None, 'prefix': None, 'hotwords': None, 'vad_filter': False}
    segments, _ = model.transcribe(pcm, **options)
    originals, words = [], []
    last_start = last_end = 0
    for segment in segments:
        originals.append(dataclasses.asdict(segment))
        need(len(originals) <= 10000, 'segment-budget')
        for word in segment.words or []:
            # Keep original seconds and confidence in originalSegments. Never expand
            # zero-duration words into fabricated positive intervals.
            need(math.isfinite(word.start) and math.isfinite(word.end) and 0 <= word.start < word.end <= len(pcm) / 16000, 'unprojectable-word-clock')
            a, b = math.floor(word.start * 16000), math.ceil(word.end * 16000)
            need(a >= last_start and b >= last_end and 0 <= a < b <= len(pcm), 'unprojectable-word-order')
            words.append({'word': word.word, 'startSample': a, 'endSampleExclusive': b})
            last_start, last_end = a, b
            need(len(words) <= 10000, 'word-budget')
    return {'schema': 'fia-window-raw-words@1', 'windowSha256': w['windowSha256'], 'planIdentity': p, 'window': w, 'runtimeEvidence': {'scriptSha256': digest(Path(__file__).read_bytes()), 'modelManifestSha256': p['modelSha256'], 'runtimeManifest': runtime(), 'modelId': job['modelId'], 'recognitionConfig': options}, 'roundingPolicy': 'seconds-floor-start-ceil-end@1', 'originalSegments': originals, 'words': words}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError('window-process-timeout')))
    signal.alarm(120)
    raw = Path(args.input).read_bytes()
    need(len(raw) <= 32768, 'job-budget')
    job = json.loads(raw)
    need(job['runtimeManifest'] == runtime(), 'runtime-manifest')
    need(job['scriptSha256'] == digest(Path(__file__).read_bytes()), 'script-hash')
    result = decode(job) if job['mode'] in ['decode', 'decode-spooled'] else recognize(job) if job['mode'] == 'recognize' else None
    need(result is not None, 'mode')
    body = canonical(result)
    need(0 < len(body) <= 4 * 1024 * 1024, 'raw-budget')
    with open(args.output, 'xb') as f:
        f.write(body)
    signal.alarm(0)

if __name__ == '__main__':
    main()
