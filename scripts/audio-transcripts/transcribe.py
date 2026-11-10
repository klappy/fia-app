#!/usr/bin/env python3
"""Pipeline step: word-by-word transcription of every known audio file, stored as a sidecar word map.

For each distinct delivered audio file in a pack's delivery manifest this writes
  <out>/<audioSha256>.words.json   (schema fia-word-transcript@1, see apps/web/src/lib/transcript.js)
with every word's startMs/endMs in the delivered file's clock, plus, for every activity whose reviewed
playbackRange lies in that file, the activity's on-screen narration split into words with char spans (from/to)
and their ms. That map is the single source of truth for lockstep highlighting, seeking to a word, and
auto-advance at end of audio.

Word times come from ASR (faster-whisper) unless a reviewed scripture alignment exists for the file
(--alignment), which is authoritative for Scripture audio. Whisper times are +-0.2 s evidence: a human review
of the sidecar is a release gate, as for any other recording range.

  transcribe.py --language en --manifest M.json --pack P.json --audio-dir DIR --urls urls.json --out OUT [--asr-dir DIR] [--alignment A.json]
  --audio-dir holds the downloaded delivery files as NN.opus (index in --urls); --asr-dir reuses NN.words.json
  ({"words":[{"w","s","e"}]}) instead of running the model (--model small.en otherwise).
"""
import argparse, bisect, difflib, hashlib, json, os, re, subprocess, sys
from lang import norm as language_norm, whisper_language, default_model, sidecar_language_fields
from decode import decode_audio
ap = argparse.ArgumentParser()
for k in ('manifest', 'pack', 'audio-dir', 'urls', 'out'): ap.add_argument('--' + k, required=True)
ap.add_argument('--language', choices=('en', 'es'), required=True, help='language of the source recording and narration'); ap.add_argument('--asr-dir'); ap.add_argument('--stale-only', action='store_true', help='optional safety net: keep a sidecar only if its audioSha256 equals the sha256 of the file bytes now in --audio-dir; otherwise re-time from those bytes'); ap.add_argument('--check', action='store_true', help='exit 1 if any sidecar is stale (CI gate), write nothing'); ap.add_argument('--alignment', action='append', default=[]); ap.add_argument('--model')
a = ap.parse_args()
a.model = a.model or default_model(a.language)
if a.language != 'en' and a.model.endswith('.en'): ap.error('English-only model cannot transcribe this language')
man, pack, urls = (json.load(open(p)) for p in (a.manifest, a.pack, a.urls))
acts = {x.get('audioSrc'): x for x in pack['activities'] if x.get('audioSrc')}
align = {}
for p in a.alignment:
    j = json.load(open(p)); align[j['audioSha256']] = j
ms = lambda s: int(round(s * 1000))
norm = lambda t: language_norm(t, a.language)

def asr_words(i):
    if a.asr_dir:
        return [dict(w=w['w'].strip(), s=w['s'], e=w['e']) for w in json.load(open(f'{a.asr_dir}/{i:02d}.words.json'))['words']]
    pcm = decode_audio(f'{a.audio_dir}/{i:02d}.opus')
    import numpy as np
    from faster_whisper import WhisperModel
    segs, _ = WhisperModel(a.model, device='cpu', compute_type='int8').transcribe(np.frombuffer(pcm, np.int16).astype(np.float32) / 32768, language=whisper_language(a.language), word_timestamps=True, vad_filter=True, condition_on_previous_text=False, no_speech_threshold=None, log_prob_threshold=None, compression_ratio_threshold=None, beam_size=5)
    return [dict(w=w.word.strip(), s=w.start, e=w.end) for s in segs for w in s.words]

def activity_map(text, W, lo, hi):
    spans = [(m.start(), m.end(), norm(m.group())) for m in re.finditer(r"\S+", text)]
    spans = [s for s in spans if s[2]]
    heard = [w for w in W if w['e'] > lo + .05 and w['s'] < hi - .05 and norm(w['w'])]
    sm = difflib.SequenceMatcher(None, [s[2] for s in spans], [norm(w['w']) for w in heard], autojunk=False)
    t = [None] * len(spans)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size): t[blk.a + k] = (heard[blk.b + k]['s'], heard[blk.b + k]['e'])
    # interpolate unheard words between their matched neighbours (inside the range)
    i = 0
    while i < len(t):
        if t[i] is None:
            j = i
            while j < len(t) and t[j] is None: j += 1
            left = t[i - 1][1] if i else lo; right = t[j][0] if j < len(t) else hi
            step = (right - left) / (j - i + 1) if right > left else 0
            for k in range(i, j): t[k] = (left + step * (k - i + .5), left + step * (k - i + 1.5)) if step else (left, left)
            i = j
        else: i += 1
    words = [dict(startMs=ms(x[0]), endMs=max(ms(x[0]), ms(x[1])), text=text[s[0]:s[1]], **{'from': s[0], 'to': s[1]}) for s, x in zip(spans, t)]
    for p, q in zip(words, words[1:]):  # monotone
        q['startMs'] = max(q['startMs'], p['startMs']); q['endMs'] = max(q['endMs'], q['startMs'])
    return dict(startMs=ms(lo), endMs=ms(hi), matched=sum(1 for b in sm.get_matching_blocks() for _ in range(b.size)), total=len(spans), words=words)

os.makedirs(a.out, exist_ok=True)
files = {}
for e in man['entries']:
    d = e['delivery']
    if d.get('kind') != 'audio' or d['url'] not in urls: continue
    files.setdefault(d['sha256'], dict(url=d['url'], duration=d['duration'], entries=[]))['entries'].append(e)
index = {}
stale = 0
for sha, f in files.items():
    i = urls.index(f['url']); dur = ms(f['duration'])
    if a.stale_only or a.check:
        # The bytes that ship are the bytes that are timed: hash what is on disk now, not what the manifest says.
        path = f'{a.audio_dir}/{i:02d}.opus'
        sha = hashlib.sha256(open(path, 'rb').read()).hexdigest()
        side = f'{a.out}/{sha}.words.json'
        if os.path.exists(side): continue
        stale += 1
        if a.check: print('STALE sidecar for', path, sha, file=sys.stderr); continue
    if sha in align:
        al = align[sha]; words = []
        for v in al['verses']:
            for w in v['words']: words.append(dict(startMs=ms(w['start']), endMs=ms(w['end']), text=v['text'][w['from']:w['to']]))
        source = 'reviewed-scripture-alignment'; W = None
    else:
        W = asr_words(i); source = 'asr:' + (a.model if not a.asr_dir else 'precomputed')
        words = [dict(startMs=ms(w['s']), endMs=min(dur, ms(w['e'])), text=w['w']) for w in W if w['w']]
    out = dict(**sidecar_language_fields(a.language), schema='fia-word-transcript@1', audioSha256=sha, sourceAudioSha256=f['entries'][0]['source']['sha256'], timingMapping=f['entries'][0]['timing'].get('mapping'), clockDomain='delivery-media-seconds', durationMs=dur, source=source, words=words, activities={})
    if W is not None:
        for e in f['entries']:
            r, act = e.get('playbackRange'), acts.get(e['path'])
            if not r or not act: continue
            text = act.get('narration') or act.get('sourceText') or ''
            if text: out['activities'][act['id']] = activity_map(text, W, r['startSeconds'], r['endSeconds'])
    json.dump(out, open(f'{a.out}/{sha}.words.json', 'w'), separators=(',', ':'))
    index[sha] = dict(words=len(words), activities=len(out['activities']), source=source)
json.dump(index, sys.stdout, indent=1)
if a.check: sys.exit(1 if stale else 0)
