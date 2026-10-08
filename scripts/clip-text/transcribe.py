#!/usr/bin/env python3
"""Transcribe exactly each block's cut, for the clip-vs-text gate.

For every block (scripts/clip-text/check.mjs --emit-blocks), cut exactly
[start, stop) from the delivered file the app plays (sha256-verified),
transcribe only that cut, and store the words under the cut's key (delivered
media sha256 + window) in tests/release/clip-text-heard.json. Range blocks
also store the same window widened 1.5 s each side, which only names *why* a
missing edge word is missing (cut vs recording wording); it never passes a
block.

Recognition follows the repo recognitionConfig shape: faster-whisper, English,
beam 5, temperature 0 only (no sampling fallback, so a rerun gives the same
words), no prompt, no VAD, no conditioning on previous text, word timestamps.
Each cut goes to the recognizer whole; faster-whisper windows long audio
itself (a hand split left padded tail chunks that invited invented endings).
Cut: ffmpeg output-side -ss/-to (decode from zero, discard to the exact
sample), mono 16 kHz PCM. Each cut also stores its edge energy (first/last
50 ms) and its lead-in/lead-out (silence before the first and after the last
10 ms frame above -40 dBFS), so the report shows timing next to the words.

usage:
  node scripts/clip-text/check.mjs --emit-blocks work/blocks.json
  python3 -I scripts/clip-text/transcribe.py --blocks work/blocks.json \
      --work work/clip-text --models <faster-whisper download root> [--model small.en]
      [--seed-cache <older cache json>] [--only <regex>] [--origin https://dev.fiaguide.app]
      [--out <json>] [--no-context]
  second recognizer for a reviewed recognizer-miss entry (tests/release/clip-text-reviewed.json):
      --model medium.en --no-context --only <block id> --out work/heard-medium.json

Requires ffmpeg and faster-whisper; media are fetched over HTTPS (the absolute
source URL, or a relative served path resolved against --origin) and refused
unless their sha256 matches the delivery record. Media are only read by ffmpeg.
"""
import argparse, hashlib, json, math, os, re, struct, subprocess, sys, wave
from urllib.parse import urljoin

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HEARD = os.path.join(ROOT, 'tests', 'release', 'clip-text-heard.json')
CONTEXT_PAD = 1.5
METHOD = 'whole-cut-t0-v2'
SPEECH_DB = -40.0


def cut_key(media, rng):
    # Must equal cutKey() in scripts/clip-text/blocks.mjs.
    def num(x):
        return repr(x) if isinstance(x, float) and not x.is_integer() else str(int(x)) if float(x).is_integer() else repr(x)
    return f'{media["sha256"]}@' + (f'{num(rng[0])}-{num(rng[1])}' if rng else 'whole')


def cache_key(sha, rng, model):
    return hashlib.sha256(json.dumps([sha, rng, model, METHOD]).encode()).hexdigest()[:20]


def media_file(work, m):
    return os.path.join(work, 'media', f'{m["sha256"]}.{m["ext"]}')


def source_url(m, origin):
    # The delivery record's absolute URL first; a relative served path (the
    # prepared-audio /v1/... route) only resolves against an origin.
    for u in (m.get('url'), m.get('served')):
        if u and re.match(r'^https://', u):
            return u
    rel = m.get('served') or m.get('url')
    if rel and origin:
        return urljoin(origin, rel)
    raise SystemExit(f'no absolute https URL for media {m["sha256"]}; pass --origin to resolve {rel}')


def fetch(work, blocks, origin=None):
    os.makedirs(os.path.join(work, 'media'), exist_ok=True)
    want = {b['media']['sha256']: b['media'] for b in blocks}
    for s, m in want.items():
        out = media_file(work, m)
        if os.path.exists(out) and hashlib.sha256(open(out, 'rb').read()).hexdigest() == s:
            continue
        if m.get('path'):
            data = open(os.path.join(ROOT, 'apps', 'web', 'public', m['path'].lstrip('/')), 'rb').read()
        else:
            tmp = out + '.part'
            subprocess.run(['curl', '-sS', '--fail', '--proto', '=https', '--max-time', '300', '-o', tmp, source_url(m, origin)], check=True)
            data = open(tmp, 'rb').read()
            os.remove(tmp)
        got = hashlib.sha256(data).hexdigest()
        if got != s:
            raise SystemExit(f'sha256 mismatch for {m.get("url") or m.get("path")}: {got} != {s}')
        open(out, 'wb').write(data)
        print('fetched', s[:12], m.get('url') or m.get('path'), flush=True)


def cut(src, out, rng):
    cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', src]
    if rng:
        cmd += ['-ss', f'{max(0.0, rng[0]):.3f}', '-to', f'{rng[1]:.3f}']
    cmd += ['-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out]
    subprocess.run(cmd, check=True)


def read_wav(path):
    with wave.open(path) as w:
        n, sr = w.getnframes(), w.getframerate()
        return struct.unpack(f'<{n}h', w.readframes(n)), sr


def db(xs):
    if not xs:
        return None
    r = math.sqrt(sum(x * x for x in xs) / len(xs)) / 32768
    return round(20 * math.log10(r), 1) if r > 0 else -120.0


def edge_db(path, ms=50):
    data, sr = read_wav(path)
    k = max(1, int(sr * ms / 1000))
    hop = sr // 100
    loud = [i for i in range(0, len(data) - hop + 1, hop) if db(data[i:i + hop]) > SPEECH_DB]
    dur = len(data) / sr
    lead_in = round(loud[0] / sr, 2) if loud else None
    lead_out = round(dur - (loud[-1] + hop) / sr, 2) if loud else None
    return {'start': db(data[:k]), 'end': db(data[-k:]), 'leadIn': lead_in, 'leadOut': lead_out, 'seconds': round(dur, 3)}


class ASR:
    def __init__(self, root, name):
        from faster_whisper import WhisperModel
        self.m = WhisperModel(name, device='cpu', compute_type='int8', download_root=root, cpu_threads=os.cpu_count() or 4)

    def __call__(self, wav):
        segs, _ = self.m.transcribe(wav, language='en', task='transcribe', beam_size=5, temperature=0.0,
                                    condition_on_previous_text=False, word_timestamps=True, vad_filter=False, initial_prompt=None)
        words = [{'w': w.word, 's': round(float(w.start), 3), 'e': round(float(w.end), 3), 'p': round(float(w.probability), 3)} for s in segs for w in s.words]
        return {'text': ''.join(w['w'] for w in words).strip(), 'words': words}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--blocks', required=True)
    ap.add_argument('--work', required=True)
    ap.add_argument('--models', required=True)
    ap.add_argument('--model', default='small.en')
    ap.add_argument('--seed-cache', action='append', default=[])
    ap.add_argument('--only')
    ap.add_argument('--out', default=HEARD)
    ap.add_argument('--origin')
    ap.add_argument('--no-context', action='store_true', help='transcribe only the exact cut (second-recognizer evidence)')
    a = ap.parse_args()
    blocks = [b for b in json.load(open(a.blocks))['blocks'] if not a.only or re.search(a.only, b['id'])]
    os.makedirs(os.path.join(a.work, 'cuts'), exist_ok=True)
    cpath = os.path.join(a.work, f'asr-{a.model}.json')
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    for seed in a.seed_cache:
        for k, v in json.load(open(seed)).items():
            cache.setdefault(k, v)
    fetch(a.work, blocks, a.origin)
    asr = None

    def heard(media, rng):
        nonlocal asr
        key = cache_key(media['sha256'], rng, a.model)
        h = cache.get(key)
        if h and 'leadIn' in h.get('edge', {}):
            return h
        wav = os.path.join(a.work, 'cuts', f'{key}.wav')
        cut(media_file(a.work, media), wav, rng)
        if not h:
            if asr is None:
                asr = ASR(a.models, a.model)
            h = asr(wav)
        h['edge'] = edge_db(wav)
        cache[key] = h
        json.dump(cache, open(cpath + '.tmp', 'w'))
        os.replace(cpath + '.tmp', cpath)
        return h

    # --only re-transcribes some blocks and keeps every other stored cut;
    # a full run rebuilds the file so no transcript outlives its block.
    doc = json.load(open(a.out)) if a.only and os.path.exists(a.out) else {'cuts': {}}
    cuts = doc.get('cuts', {})
    for n, b in enumerate(blocks):
        rng = b['range']
        h = heard(b['media'], rng)
        entry = {'text': h['text'], 'edge': {k: h['edge'][k] for k in ('start', 'end', 'leadIn', 'leadOut')}}
        if rng and not a.no_context:
            crng = [max(0.0, rng[0] - CONTEXT_PAD), rng[1] + CONTEXT_PAD]
            c = heard(b['media'], crng)
            entry['context'] = {'range': [round(crng[0], 3), round(crng[1], 3)], 'text': c['text'],
                                'words': [[w['w'], round(w['s'] + crng[0], 3), round(w['e'] + crng[0], 3)] for w in c['words']]}
        cuts[cut_key(b['media'], rng)] = entry
        print(f'[{n + 1}/{len(blocks)}] {b["id"]} | {h["text"][:90]}', flush=True)
    out = {'schema': 2,
           'method': {'recognizer': 'faster-whisper', 'model': a.model, 'computeType': 'int8', 'language': 'en', 'beamSize': 5, 'temperature': 0.0,
                      'initialPrompt': None, 'vadFilter': False, 'conditionOnPreviousText': False, 'wordTimestamps': True,
                      'cut': 'ffmpeg output-side -ss/-to on the sha256-verified delivered file, mono 16 kHz PCM',
                      'chunking': 'none: each cut is one recognizer input', 'contextPadSeconds': CONTEXT_PAD,
                      'edge': 'RMS dBFS of the first/last 50 ms; leadIn/leadOut = silence outside the first/last 10 ms frame above -40 dBFS'},
           'cuts': dict(sorted(cuts.items()))}
    with open(a.out, 'w') as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'{len(cuts)} cuts -> {a.out}')


if __name__ == '__main__':
    main()
