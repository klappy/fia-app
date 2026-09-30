import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  noticePlainText,
  noticeTokens,
  parseLicenseInfo,
  parseRightsRecords,
  safeHref,
} from '../src/settings/rights';

// Records copied verbatim from alpha/l1-pipeline data/rights/records.json (C-13).
const records = JSON.parse(
  readFileSync(new URL('./fixtures/l5/rights-records.json', import.meta.url), 'utf8'),
) as unknown[];

describe('C-13 rights → S15 rows', () => {
  it('validates every record and renders verbatim fields', () => {
    const { rows, rejected } = parseRightsRecords(records);
    expect(rejected).toEqual([]);
    expect(rows.map((r) => r.collection)).toEqual(['FIATranslationGuide', 'FIAMaps']);
    const guide = rows[0];
    expect(guide.holder).toBe('Word Collective');
    expect(guide.licence).toBe('CC BY-SA 4.0 license');
    expect(guide.licenseInfo).toBe((records[0] as { licenseInfo: string }).licenseInfo);
    expect(guide.bothHolders).toBeUndefined();
  });
  it('FIAMaps keeps both holders and its discrepancy; code resolves nothing (R-312)', () => {
    const maps = parseRightsRecords(records).rows[1];
    expect(maps.holder).toBe('Biblica');
    expect(maps.holders).toEqual(['Biblica', 'Word Collective', 'Mission Mutual']);
    expect(maps.bothHolders).toEqual({ holderA: 'Biblica', holderB: 'Word Collective' });
    expect(maps.discrepancies[0]).toMatch(/holder differs/);
  });
  it('rejects a record that breaks C-13 instead of patching it', () => {
    const bad = { ...(records[0] as object), holders: [] };
    const r = parseRightsRecords([bad, records[1]]);
    expect(r.rows).toHaveLength(1);
    expect(r.rejected[0].index).toBe(0);
  });
  it('non-array input renders nothing', () => {
    expect(parseRightsRecords({}).rows).toEqual([]);
  });
  it('plain licence strings pass through', () => {
    expect(parseLicenseInfo('CC BY-SA 4.0')).toEqual({ licenseName: 'CC BY-SA 4.0' });
  });
  it('adaptation notice → tokens: bold/cite honoured, markup never rendered as HTML', () => {
    const html = (records[1] as { adaptationNotice: string }).adaptationNotice;
    const toks = noticeTokens(html);
    expect(toks[0]).toMatchObject({ b: true });
    expect(toks.some((t) => t.cite)).toBe(true);
    expect(noticePlainText(html)).not.toMatch(/[<>]/);
    expect(noticePlainText(html)).toContain('© 2025 Word Collective');
    expect(noticePlainText('<script>x</script><img src=x onerror=1>a &amp; b')).toBe('xa & b');
  });
});

describe('review fia-app#5 LOWs', () => {
  it('out-of-range numeric entities are left as text, never thrown', () => {
    expect(() => noticePlainText('<p>a &#99999999; b &#x110000; c</p>')).not.toThrow();
    expect(noticePlainText('<p>&#99999999;</p>')).toContain('&#99999999;');
    expect(noticePlainText('<p>&#169;</p>')).toContain('©');
  });
  it('only http(s) rights links become hrefs', () => {
    expect(safeHref('https://example.org/l')).toBe('https://example.org/l');
    expect(safeHref('http://example.org')).toBe('http://example.org');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,x')).toBeUndefined();
    expect(safeHref('not a url')).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});
