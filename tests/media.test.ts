import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createValidator, type ContractSchema } from '../src/contracts/validate';
import {
  alignmentErrors,
  mapPositionByVerse,
  positionAt,
  seekToVerse,
  seekToWord,
  splitVerse,
  timingMode,
  usableAlignment,
  type AlignmentSidecar,
} from '../src/media/alignment';
import {
  assertNoBackendName,
  markFor,
  provenanceSheet,
  scriptureTextMark,
  selectNarration,
  ScriptureAIError,
} from '../src/media/provenance';
import {
  buildCards,
  chipCounts,
  filterCards,
  htmlToParagraphs,
  videoState,
  type ResourcesPack,
} from '../src/media/resources';
import {
  readerEditions,
  sameVerseIndex,
  sourceIdOf,
  splitEditions,
  verseBody,
  type ScripturePack,
} from '../src/media/scripture';
import {
  clampSeek,
  formatClock,
  fractionToSec,
  playPhase,
  rememberPosition,
  resumeKey,
  resumePosition,
  secToFraction,
  sliderVisible,
} from '../src/media/seek';
import { EN, format } from '../src/i18n';
import { clipsFor, scriptureClipId } from '../src/media/narration';
import { markWords } from '../src/media/marks';

// Small fixture trimmed from the L1 packs (eng/tpi MRK-1-1-13, hau LUK-6-17-19); the alignment
// sidecar is synthetic (L1 ships no sidecars yet) but schema-valid C-12.
const fx = (f: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/media', f), 'utf8')) as unknown;
const align = fx('alignment.bsb.json') as AlignmentSidecar;
const scrEng = fx('scripture.eng.json') as ScripturePack;
const scrHau = fx('scripture.hau.json') as ScripturePack;
const resEng = fx('resources.eng.json') as ResourcesPack;
const resTpi = fx('resources.tpi.json') as ResourcesPack;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const dir = join(process.cwd(), 'contracts');
const schemas = readdirSync(dir)
  .filter((f) => f.endsWith('.schema.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ContractSchema);
const validator = createValidator(schemas);
const C06 = 'https://fia.klappy.dev/contracts/c06-provenance.schema.json';
const C12 = 'https://fia.klappy.dev/contracts/c12-alignment-sidecar.schema.json';

describe('alignment (C-12, R-504)', () => {
  it('fixture validates against the C-12 schema and the structural checks', () => {
    expect(validator.validate(C12, align).errors).toEqual([]);
    expect(alignmentErrors(align)).toEqual([]);
  });
  it('rejects non-monotonic, out-of-duration and overlapping sidecars', () => {
    const a = clone(align);
    a.verses[1].start = a.verses[0].start;
    expect(alignmentErrors(a).some((e) => e.includes('before previous verse'))).toBe(true);
    const b = clone(align);
    b.duration = 1;
    expect(alignmentErrors(b).some((e) => e.includes('after duration'))).toBe(true);
    const c = clone(align);
    c.verses[0].words[1].from = c.verses[0].words[0].from;
    expect(alignmentErrors(c).some((e) => e.includes('overlaps'))).toBe(true);
    const d = clone(align);
    d.verses[0].words[0].to = d.verses[0].text.length + 5;
    expect(alignmentErrors(d).some((e) => e.includes('past end'))).toBe(true);
  });
  it('is unused (null) when the playing clip hash differs — no highlight, no seek, no error', () => {
    expect(usableAlignment(align, align.audioSha256)).toBe(align);
    expect(usableAlignment(align, 'f'.repeat(64))).toBeNull();
    expect(usableAlignment(align, null)).toBeNull();
    expect(timingMode(usableAlignment(align, 'f'.repeat(64)))).toBe('none');
  });
  it('timing mode: word when words timed, verse with offsets only', () => {
    expect(timingMode(align)).toBe('word');
    const v = clone(align);
    v.verses.forEach((x) => (x.words = []));
    expect(timingMode(v)).toBe('verse');
  });
  it('highlight from elapsed: start, middle, end', () => {
    expect(positionAt(align, 0)).toEqual({ verse: 0, word: 0 });
    const mid = align.verses[1].words[3];
    expect(positionAt(align, (mid.start + mid.end) / 2)).toEqual({ verse: 1, word: 3 });
    const last = align.verses[2];
    const lw = last.words.length - 1;
    expect(positionAt(align, last.words[lw].start)).toEqual({ verse: 2, word: lw });
    expect(positionAt(align, align.duration)).toEqual({ verse: -1, word: -1 });
  });
  it('keeps the last word lit through a pause between words and the verse lit between verses', () => {
    const w0 = align.verses[0].words[0];
    expect(positionAt(align, w0.end + 0.01)).toEqual({ verse: 0, word: 0 });
    const gap = (align.verses[0].end + align.verses[1].start) / 2;
    expect(positionAt(align, gap)).toEqual({ verse: 0, word: -1 });
  });
  it('tap-to-seek targets round-trip to the tapped word/verse', () => {
    for (const [vi, wi] of [
      [0, 0],
      [1, 4],
      [2, align.verses[2].words.length - 1],
    ]) {
      const t = seekToWord(align, vi, wi)!;
      expect(positionAt(align, t)).toEqual({ verse: vi, word: wi });
    }
    expect(seekToVerse(align, 2)).toBe(align.verses[2].start);
    expect(seekToWord(align, 9, 0)).toBeNull();
  });
  it('edition switch keeps the position by verse', () => {
    const other = clone(align);
    other.verses.forEach((v, i) => ((v.start += 10 * i), (v.end += 10 * i)));
    const t = align.verses[1].words[2].start;
    expect(mapPositionByVerse(align, other, t)).toEqual({
      sourceId: 'MRK-1-2',
      t: other.verses[1].start,
    });
    expect(mapPositionByVerse(align, null, t)).toEqual({ sourceId: null, t: 0 });
  });
  it('splits a verse on alignment tokens, not whitespace, and loses no text', () => {
    const v = align.verses[1];
    const parts = splitVerse(v);
    expect(parts.map((p) => p.text).join('')).toBe(v.text);
    expect(parts.filter((p) => p.word !== null)).toHaveLength(v.words.length);
  });
});

describe('seek math (R-505)', () => {
  it('slider on every clip > 30 s only', () => {
    expect(sliderVisible(30)).toBe(false);
    expect(sliderVisible(30.1)).toBe(true);
    expect(sliderVisible(NaN)).toBe(false);
  });
  it('clamps seeks and converts fractions', () => {
    expect(clampSeek(-3, 100)).toBe(0);
    expect(clampSeek(130, 100)).toBe(100);
    expect(clampSeek(NaN, 100)).toBe(0);
    expect(fractionToSec(0.5, 192)).toBe(96);
    expect(fractionToSec(1.4, 192)).toBe(192);
    expect(secToFraction(48, 192)).toBe(0.25);
    expect(secToFraction(5, 0)).toBe(0);
  });
  it('formats the clock', () => {
    expect(formatClock(64)).toBe('1:04');
    expect(formatClock(192.9)).toBe('3:12');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(-1)).toBe('0:00');
  });
  it('keeps the resume position per clip hash; finished restarts', () => {
    const k = resumeKey('eng-t4-v1-audio', 'ab'.repeat(32));
    let m = rememberPosition({}, k, 41.2, 95);
    expect(resumePosition(m, k, 95)).toBe(41.2);
    expect(resumePosition(m, resumeKey('eng-t4-v1-audio', 'cd'.repeat(32)), 95)).toBe(0);
    m = rememberPosition(m, k, 94, 95);
    expect(resumePosition(m, k, 95)).toBe(0);
  });
  it('derives the primary phase', () => {
    expect(playPhase(false, 0, 60)).toBe('idle');
    expect(playPhase(true, 3, 60)).toBe('playing');
    expect(playPhase(false, 3, 60)).toBe('paused');
    expect(playPhase(false, 60, 60)).toBe('finished');
  });
});

describe('provenance labelling (C-06, R-313, R-503)', () => {
  const generated = {
    status: 'generated',
    provenance: {
      status: 'generated' as const,
      generatedFrom: 'FIAKeyTerms@a39260670bba9d87d902e0fa0ae447341343481f:tpi/t4#audio',
      generator: 'narration' as const,
    },
  };
  it('generated records validate against C-06 and are marked AI', () => {
    expect(validator.validate(C06, generated.provenance).errors).toEqual([]);
    expect(markFor(generated, 'audio')).toBe('ai-voice');
    expect(markFor(generated, 'description')).toBe('ai-voice');
    expect(markFor({ ...generated }, 'text')).toBe('ai-translation');
  });
  it('AI is never presented as source, even when fields disagree', () => {
    expect(markFor({ status: 'source', ai: true }, 'audio')).toBe('ai-voice');
    expect(markFor({ status: 'source', provenance: generated.provenance }, 'text')).toBe(
      'ai-translation',
    );
  });
  it('source, unfilled AI slots and English fallbacks', () => {
    expect(markFor(resEng.terms[0].audio, 'audio')).toBe('source');
    expect(markFor(resTpi.terms[0].audio, 'audio')).toBe('absent'); // AI slot not yet generated
    expect(markFor(resTpi.images[0].titleProvenance, 'text')).toBe('absent');
    expect(markFor(undefined, 'text')).toBe('absent');
  });
  it('every pack provenance in the fixture validates against C-06', () => {
    const recs = [
      resEng.terms[0].text.provenance,
      resEng.terms[0].audio.provenance,
      resTpi.terms[0].audio.provenance,
      ...scrEng.editions.map((e) => e.provenance),
    ];
    for (const r of recs) expect(validator.validate(C06, r).errors).toEqual([]);
  });
  it('Scripture text is never AI: a generated edition throws and is refused by the reader', () => {
    expect(() => scriptureTextMark({ status: 'generated' })).toThrow(ScriptureAIError);
    const bad = clone(scrEng);
    bad.editions[1].status = 'generated';
    expect(readerEditions(bad).map((e) => e.short)).toEqual([scrEng.editions[0].short]);
    expect(() =>
      provenanceSheet({ domain: 'text', slot: { status: 'generated' }, scripture: true }),
    ).toThrow(ScriptureAIError);
  });
  it('narration modes (R-501, R-502)', () => {
    const src = { id: 's', url: 's.mp3' };
    const ai = { id: 'g', url: 'g.ogg' };
    expect(selectNarration('source-fallback', { source: src, generated: ai }).mark).toBe('source');
    expect(selectNarration('source-fallback', { generated: ai })).toEqual({
      clip: ai,
      mark: 'ai-voice',
    });
    expect(selectNarration('source-only', { generated: ai })).toEqual({
      clip: null,
      mark: 'absent',
      silent: 'source-only-silent',
    });
    expect(selectNarration('generated-only', { source: src, generated: ai }).clip).toBe(ai);
    expect(selectNarration('source-fallback', {}).silent).toBe('no-audio');
  });
  it('SH-1 sheet model follows spec 20 § States', () => {
    expect(provenanceSheet({ domain: 'audio', slot: generated }).titleKey).toBe(
      's.prov.title.ai-voice',
    );
    const unmatched = provenanceSheet({ domain: 'audio', slot: generated, unmatched: true });
    expect(unmatched.bodyKeys).toEqual(['s.prov.body.unmatched']);
    const src = provenanceSheet({ domain: 'audio', slot: resEng.terms[0].audio });
    expect(src.titleKey).toBe('s.prov.title.source');
    expect(src.bodyKeys).toEqual(['s.prov.body.source', 's.prov.body.source-speaker']);
    const silent = provenanceSheet({ domain: 'audio', slot: undefined, sourceOnlySilent: true });
    expect(silent.rows).toContain('change-settings');
    const fb = provenanceSheet({ domain: 'text', slot: { status: 'absent' }, englishShown: true });
    expect(fb.bodyKeys).toEqual(['s.prov.body.absent-fallback']);
    const scr = provenanceSheet({
      domain: 'audio',
      slot: generated,
      scripture: true,
      readsEnglish: true,
    });
    expect(scr.titleKey).toBe('s.prov.title.ai-voice-scripture');
    expect(scr.bodyKeys).toEqual([
      's.prov.body.scripture',
      's.prov.body.ai-voice',
      's.prov.body.reads-english',
    ]);
    for (const m of [unmatched, src, silent, fb, scr])
      for (const k of [m.titleKey, ...m.bodyKeys]) expect(EN[k], k).toBeTruthy();
  });
  it('no backend name on any mark or sheet string (R-313 Accept)', () => {
    const keys = Object.keys(EN).filter(
      (k) => k.startsWith('s.common.mark.') || k.startsWith('s.prov.'),
    );
    for (const k of keys) expect(() => assertNoBackendName(format(EN[k], {}))).not.toThrow();
    expect(() => assertNoBackendName('Aquifer voice')).toThrow();
  });
});

describe('scripture reader model (S08)', () => {
  it('numbers verses and strips the leading number from the text', () => {
    const [bsb] = readerEditions(scrEng);
    expect(bsb.verses[0]).toMatchObject({ n: 1, sourceId: 'MRK-1-1' });
    expect(bsb.verses[0].text.startsWith('This is the beginning')).toBe(true);
    expect(verseBody('10 text', 1)).toBe('10 text');
    expect(sourceIdOf('42006017')).toBe('LUK-6-17');
  });
  it('absent Scripture falls back to English, badged, never AI', () => {
    const eds = readerEditions(scrHau);
    expect(eds[0]).toMatchObject({ language: 'eng', fallback: true, mark: 'absent' });
  });
  it('edition switch keeps the verse in view; three inline + more', () => {
    const [a, b] = readerEditions(scrEng);
    expect(sameVerseIndex(b, a.verses[2].ref)).toBe(2);
    expect(sameVerseIndex(b, 'nope')).toBe(0);
    expect(splitEditions([1, 2, 3, 4, 5])).toEqual({ inline: [1, 2, 3], more: [4, 5] });
  });
});

describe('resources catalog (S09, R-508)', () => {
  it('builds one card per item with chip counts', () => {
    const cards = buildCards(resEng);
    expect(chipCounts(cards)).toEqual({ terms: 1, images: 1, maps: 1, videos: 1 });
    expect(cards.every((c) => c.openable)).toBe(true);
  });
  it('marks non-English fallbacks and offline states honestly', () => {
    const cards = buildCards(resTpi, { offline: true });
    const map = cards.find((c) => c.type === 'maps')!;
    expect(map.mark).toBe('absent');
    expect(cards.find((c) => c.type === 'videos')!.captionKey).toBe('s.resources.streams');
    expect(cards.find((c) => c.type === 'terms')!.audioMark).toBe('absent');
    const online = buildCards(resTpi);
    expect(online.find((c) => c.type === 'maps')!.captionKey).toBe('s.resources.open-english-map');
  });
  it('filters by chip and diacritic-insensitive search', () => {
    const cards = buildCards(resEng);
    expect(filterCards(cards, 'terms')).toHaveLength(1);
    const title = cards.find((c) => c.type === 'images')!.title;
    expect(filterCards(cards, 'all', title.toUpperCase())[0].title).toBe(title);
    expect(filterCards([{ ...cards[0], title: 'Jesús' }], 'all', 'jesus')).toHaveLength(1);
    expect(filterCards(cards, 'all', 'zzzz')).toHaveLength(0);
  });
  it('term text and video state', () => {
    expect(htmlToParagraphs('<p>An <b>angel</b>&nbsp;is</p><p>Two</p>')).toEqual([
      'An angel is',
      'Two',
    ]);
    expect(videoState(resEng.videos[0], false)).toBe('needs-connection');
    expect(videoState(resEng.videos[0], true)).toBe('playable');
  });
});

describe('narration manifest → clips (C-05)', () => {
  const sha = 'a'.repeat(64);
  const entry = {
    id: 'scripture-bsb',
    path: '/audio/bsb.ogg',
    sha256: 'b'.repeat(64),
    mime: 'audio/ogg',
    sourceSha256: sha,
    recordingSource: 'generated' as const,
    ai: true,
    durationSeconds: 52,
  };
  const m = { schemaVersion: 1 as const, packId: 'x', language: 'eng', entries: [entry] };
  it('names Scripture clips per edition', () => {
    expect(scriptureClipId('BSB')).toBe('scripture-bsb');
  });
  it('finds the generated clip for the text on screen', () => {
    const c = clipsFor(m, 'scripture-bsb', sha, '/content');
    expect(c.source).toBeNull();
    expect(c.generated).toMatchObject({ url: '/content/audio/bsb.ogg', durationSec: 52 });
  });
  it('refuses a clip made from different text', () => {
    expect(clipsFor(m, 'scripture-bsb', 'c'.repeat(64)).generated).toBeNull();
  });
  it('an ai flag on a "source" entry still makes it generated', () => {
    const odd = { ...m, entries: [{ ...entry, recordingSource: 'source' as const }] };
    expect(clipsFor(odd, 'scripture-bsb', sha).source).toBeNull();
  });
  it('an empty manifest (L1 today) yields no clips', () => {
    expect(clipsFor({ ...m, entries: [] }, 'scripture-bsb', sha)).toEqual({
      source: null,
      generated: null,
    });
  });
});

describe('mark words (R-313, R-503)', () => {
  it('AI marks say AI, never "source"; absent names the language', () => {
    expect(markWords('ai-voice')).toBe('AI voice');
    expect(markWords('ai-voice', 'Español')).toBe('AI voice · Español');
    expect(markWords('ai-translation')).toMatch(/^AI /);
    expect(markWords('source')).toBe('source recording');
    expect(markWords('absent', 'Tok Pisin')).toBe('not yet in Tok Pisin');
  });
});
