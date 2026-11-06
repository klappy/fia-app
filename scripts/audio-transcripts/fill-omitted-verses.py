#!/usr/bin/env python3
"""Add the words of verses a reviewed Scripture sidecar does not carry, so every verse highlights word by word.

The reviewed Berean sidecar for Mark 1:1-13 times 8 of 13 verses; verses 4, 6, 7, 8 and 10 were never transcribed, so they only
scrolled. This fills those gaps (and only those gaps) from a fresh ASR pass of the same delivery audio (faster-whisper small.en,
word timestamps), shifted by the median offset between the ASR and the reviewed words so both sit on one clock. Reviewed words are
never changed. Usage: fill-omitted-verses.py <sidecar.json> <asr.json [[start,end,text],...]> <shift_ms> <from_s:to_s> ...
Each from:to window is the silence between two reviewed words; only ASR words that START inside it are added."""
import json, sys
side, asr, shift = sys.argv[1], json.load(open(sys.argv[2])), int(sys.argv[3])
wins = [tuple(map(float, a.split(':'))) for a in sys.argv[4:]]
d = json.load(open(side)); words = d['words']; added = 0
for lo, hi in wins:
    if any(lo * 1000 <= w['startMs'] < hi * 1000 for w in words): sys.exit(f'window {lo}:{hi} already holds words')
    seg = [a for a in asr if lo <= a[0] < hi]
    prev = None
    for s, e, t in seg:
        if prev and t.strip(' ,.').lower() == prev[2].strip(' ,.').lower() and s - prev[0] < .6: continue  # ASR stutter
        words.append({'startMs': int(round(s * 1000)) + shift, 'endMs': int(round(e * 1000)) + shift, 'text': t}); prev = (s, e, t); added += 1
words.sort(key=lambda w: w['startMs'])
for a, b in zip(words, words[1:]):
    if a['endMs'] > b['startMs'] and a['endMs'] - b['startMs'] < 400: a['endMs'] = b['startMs']
d['supplement'] = {'note': 'Words for verses the reviewed alignment omits, from ASR (faster-whisper small.en) shifted onto the reviewed clock; reviewed words untouched.', 'windowsSeconds': wins, 'shiftMs': shift, 'added': added}
json.dump(d, open(side, 'w'), separators=(',', ':'), ensure_ascii=False)
print('added', added)
