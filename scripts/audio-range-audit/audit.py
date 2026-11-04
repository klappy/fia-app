#!/usr/bin/env python3
"""Audit reviewed guide playback ranges against what is actually spoken.

Inputs (all read-only):
  --manifest  content/delivery/<pack>/<sha>.json   (entries[].playbackRange, delivery.url)
  --pack      content/packs/<pack>/<sha>.json      (activities[].audioSrc, narration)
  --words     dir of ASR word timings: NN.words.json = {"words":[{"w","s","e"}]}, NN = index of
              the delivery URL in --urls (a JSON list of delivery URLs, same order as downloaded files)
  --urls      JSON list of delivery URLs

For every ranged unit it reports: text match between the expected narration and the words heard
inside [start,end]; whether a heard word straddles either boundary (a cut word); and the lead/tail
silence inside the range. ASR is evidence, not authority: low match with long ASR gaps is flagged
'asr-gap' rather than 'drift'. Exit code is 1 when any unit is 'cut' or 'drift'.
"""
import argparse, difflib, json, re, sys
ap = argparse.ArgumentParser()
for k in ('manifest', 'pack', 'words', 'urls'): ap.add_argument('--' + k, required=True)
ap.add_argument('--straddle', type=float, default=0.3, help='seconds a word may cross a boundary')
ap.add_argument('--drift', type=float, default=0.6, help='minimum text match ratio')
a = ap.parse_args()
norm = lambda t: re.findall(r"[a-z0-9']+", t.lower())
man, pack, urls = (json.load(open(p)) for p in (a.manifest, a.pack, a.urls))
acts = {x.get('audioSrc'): x for x in pack['activities'] if x.get('audioSrc')}
rows, bad = [], 0
for e in man['entries']:
    r = e.get('playbackRange')
    if not r or e['path'] not in acts or e['delivery']['url'] not in urls: continue
    i = urls.index(e['delivery']['url'])
    try: W = json.load(open(f'{a.words}/{i:02d}.words.json'))['words']
    except FileNotFoundError: continue
    s, t = r['startSeconds'], r['endSeconds']
    exp = norm(acts[e['path']].get('narration') or acts[e['path']].get('sourceText') or '')
    inr = [x for w in W if w['e'] > s + .05 and w['s'] < t - .05 for x in norm(w['w'])]
    ratio = difflib.SequenceMatcher(None, exp, inr).ratio()
    cut_head = [w['w'].strip() for w in W if w['s'] < s - a.straddle and w['e'] > s + a.straddle]
    cut_tail = [w['w'].strip() for w in W if w['s'] < t - a.straddle and w['e'] > t + a.straddle]
    inside = [w for w in W if w['s'] >= s - .05 and w['e'] <= t + .05]
    lead = round(inside[0]['s'] - s, 2) if inside else None
    tail = round(t - inside[-1]['e'], 2) if inside else None
    longgap = bool(inside) and max([inside[0]['s'] - s, t - inside[-1]['e']] + [b['s'] - a_['e'] for a_, b in zip(inside, inside[1:])]) > 8
    status = 'cut' if (cut_head or cut_tail) else ('ok' if ratio >= a.drift else ('asr-gap' if longgap or not inside else 'drift'))
    bad += status in ('cut', 'drift')
    rows.append(dict(unit=e['path'].rsplit('/', 1)[-1], start=s, end=t, match=round(ratio, 2), lead=lead, tail=tail, cutHead=cut_head, cutTail=cut_tail, status=status))
json.dump(rows, sys.stdout, indent=1)
print(file=sys.stderr); print({k: sum(r['status'] == k for r in rows) for k in ('ok', 'asr-gap', 'drift', 'cut')}, file=sys.stderr)
sys.exit(1 if bad else 0)
