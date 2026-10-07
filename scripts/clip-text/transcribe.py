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
beam 5, best_of 5, no prompt, no VAD, no conditioning on previous text, word
timestamps. Cuts over 26 s are split at their quietest 200 ms so no ASR window
cuts a word. Cut: ffmpeg output-side -ss/-to (decode from zero, discard to the
exact sample), mono 16 kHz PCM.

usage:
  node scripts/clip-text/check.mjs --emit-blocks work/blocks.json
  python3 -I scripts/clip-text/transcribe.py --blocks work/blocks.json \
      --work work/clip-text --models <faster-whisper download root> [--model small.en]
      [--seed-cache <older cache json>] [--only <regex>]

Requires ffmpeg and faster-whisper; media are fetched over HTTPS and refused
unless their sha256 matches the delivery record. Media are only read by ffmpeg.
"""
import argparse, hashlib, json, math, os, re, struct, subprocess, sys, wave

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HEARD = os.path.join(ROOT, 'tests', 'release', 'clip-text-heard.json')
CONTEXT_PAD = 1.5


def cut_key(media, rng):
    # Must equal cutKey() in scripts/clip-text/blocks.mjs.
    def num(x):
        return repr(x) if isinstance(x, float) and not x.is_integer() else str(int(x)) if float(x).is_integer() else repr(x)
    return f'{media["sha256"]}@' + (f'{num(rng[0])}-{num(rng[1])}' if rng else 'whole')


def cache_key(sha, rng, model):
    return hashlib.sha256(json.dumps([sha, rng, model, 'chunked-v1']).encode()).hexdigest()[:20]


def media_file(work, m):
    return os.path.join(work, 'media', f'{m["sha256"]}.{m["ext"]}')


def fetch(work, blocks):
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
            subprocess.run(['curl', '-sS', '--fail', '--proto', '=https', '--max-time', '300', '-o', tmp, m.get('served') or m['url']], check=True)
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


def edge_db(path, ms=50):
    data, sr = read_wav(path)
    k = max(1, int(sr * ms / 1000))

    def db(xs):
        if not xs:
            return None
        r = math.sqrt(sum(x * x for x in xs) / len(xs)) / 32768
        return round(20 * math.log10(r), 1) if r > 0 else -120.0
    return {'start': db(data[:k]), 'end': db(data[-k:]), 'seconds': round(len(data) / sr, 3)}


def silence_splits(path, max_len=26.0, min_len=12.0):
    data, sr = read_wav(path)
    hop = sr // 50
    frames = [sum(x * x for x in data[i:i + hop]) / hop for i in range(0, len(data) - hop + 1, hop)]
    dur = len(data) / sr
    splits, t = [], 0.0
    while dur - t > max_len:
        lo, hi = int((t + min_len) * 50), int((t + max_len) * 50)
        best = min(range(lo, hi - 10), key=lambda i: sum(frames[i:i + 10]))
        t = (best + 5) / 50
        splits.append(round(t, 3))
    return splits


class ASR:
    def __init__(self, root, name):
        from faster_whisper import WhisperModel
        self.m = WhisperModel(name, device='cpu', compute_type='int8', download_root=root, cpu_threads=os.cpu_count() or 4)

    def one(self, wav, offset=0.0):
        segs, _ = self.m.transcribe(wav, language='en', task='transcribe', beam_size=5, best_of=5,
                                    condition_on_previous_text=False, word_timestamps=True, vad_filter=False, initial_prompt=None)
        return [{'w': w.word, 's': round(float(w.start) + offset, 3), 'e': round(float(w.end) + offset, 3), 'p': round(float(w.probability), 3)} for s in segs for w in s.words]

    def __call__(self, wav):
        splits = silence_splits(wav)
        if not splits:
            words = self.one(wav)
        else:
            words, edges = [], [0.0] + splits + [None]
            for k in range(len(edges) - 1):
                piece = f'{wav}.p{k}.wav'
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', wav, '-ss', f'{edges[k]:.3f}'] + (['-to', f'{edges[k + 1]:.3f}'] if edges[k + 1] else []) + ['-c:a', 'pcm_s16le', piece], check=True)
                words += self.one(piece, edges[k])
                os.remove(piece)
        return {'text': ''.join(w['w'] for w in words).strip(), 'words': words, 'splits': splits}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--blocks', required=True)
    ap.add_argument('--work', required=True)
    ap.add_argument('--models', required=True)
    ap.add_argument('--model', default='small.en')
    ap.add_argument('--seed-cache', action='append', default=[])
    ap.add_argument('--only')
    ap.add_argument('--out', default=HEARD)
    a = ap.parse_args()
    blocks = [b for b in json.load(open(a.blocks))['blocks'] if not a.only or re.search(a.only, b['id'])]
    os.makedirs(os.path.join(a.work, 'cuts'), exist_ok=True)
    cpath = os.path.join(a.work, f'asr-{a.model}.json')
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    for seed in a.seed_cache:
        for k, v in json.load(open(seed)).items():
            cache.setdefault(k, v)
    fetch(a.work, blocks)
    asr = None

    def heard(media, rng):
        nonlocal asr
        key = cache_key(media['sha256'], rng, a.model)
        h = cache.get(key)
        if h and h.get('edge'):
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

    doc = json.load(open(a.out)) if os.path.exists(a.out) and not a.only else {'cuts': {}}
    cuts = {} if not a.only else doc.get('cuts', {})
    for n, b in enumerate(blocks):
        rng = b['range']
        h = heard(b['media'], rng)
        entry = {'text': h['text'], 'edge': {'start': h['edge']['start'], 'end': h['edge']['end']}}
        if rng:
            crng = [max(0.0, rng[0] - CONTEXT_PAD), rng[1] + CONTEXT_PAD]
            c = heard(b['media'], crng)
            entry['context'] = {'range': [round(crng[0], 3), round(crng[1], 3)], 'text': c['text'],
                                'words': [[w['w'], round(w['s'] + crng[0], 3), round(w['e'] + crng[0], 3)] for w in c['words']]}
        cuts[cut_key(b['media'], rng)] = entry
        print(f'[{n + 1}/{len(blocks)}] {b["id"]} | {h["text"][:90]}', flush=True)
    out = {'schema': 1,
           'method': {'recognizer': 'faster-whisper', 'model': a.model, 'computeType': 'int8', 'language': 'en', 'beamSize': 5, 'bestOf': 5,
                      'initialPrompt': None, 'vadFilter': False, 'conditionOnPreviousText': False, 'wordTimestamps': True,
                      'cut': 'ffmpeg output-side -ss/-to on the sha256-verified delivered file, mono 16 kHz PCM',
                      'chunking': 'cuts over 26 s split at their quietest 200 ms', 'contextPadSeconds': CONTEXT_PAD},
           'cuts': dict(sorted(cuts.items()))}
    with open(a.out, 'w') as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'{len(cuts)} cuts -> {a.out}')


if __name__ == '__main__':
    main()
