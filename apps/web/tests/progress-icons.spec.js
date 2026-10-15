import { describe, it, expect } from 'vitest';
import { Ear } from 'lucide-svelte';
import { contentIcons, sectionIcons, bookName, pericopeName, passageName } from '../src/lib/progress-icons.js';

describe('icon vocabulary (design book tokens § Icon vocabulary)', () => {
 it('has seven content kinds and six stages', () => {
  expect(Object.keys(contentIcons).sort()).toEqual(['discussion','guide','image','map','scripture','term','video']);
  expect(sectionIcons).toHaveLength(6);
 });
 it('never shares a glyph between the stage set and the content set', () => {
  const content = new Set(Object.values(contentIcons));
  for (const stage of sectionIcons) expect(content.has(stage)).toBe(false);
  expect(new Set(sectionIcons).size).toBe(6);
  expect(content.size).toBe(7);
 });
 it('listen is the guide glyph, the ear', () => { expect(contentIcons.guide).toBe(Ear); });
});

describe('passage line under the stage icons (ticket 2026-10-15 passage-name-replaces-step-label)', () => {
 it('uses the catalog title, which already carries the full localized book name', () => {
  expect(passageName({title:'Mark 1:1–13',language:'eng',pericopeId:'MRK-1-1-13'})).toBe('Mark 1:1–13');
  expect(passageName({title:'Marcos 1:1–13',language:'spa',pericopeId:'MRK-1-1-13'})).toBe('Marcos 1:1–13');
 });
 it('never shows a short code: a coded title or a missing title is rebuilt with the full book name', () => {
  expect(passageName({title:'MRK 1:1–13',language:'eng'})).toBe('Mark 1:1–13');
  expect(passageName({title:'LUK 2:1–7',language:'spa'})).toBe('Lucas 2:1–7');
  expect(passageName({language:'eng',pericopeId:'LUK-1-1-4'})).toBe('Luke 1:1–4');
  expect(passageName({language:'spa',pericopeId:'MRK-2-23-3-6'})).toBe('Marcos 2:23–3:6');
 });
 it('appends a heading only when the data supplies one', () => {
  expect(passageName({title:'Mark 1:1–13',heading:'John the Baptist Prepares the Way'})).toBe('Mark 1:1–13 · John the Baptist Prepares the Way');
  expect(passageName({title:'Mark 1:1–13',heading:'  '})).toBe('Mark 1:1–13');
 });
 it('knows the longest names in English and Spanish', () => {
  expect(bookName('SNG','eng')).toBe('Song of Solomon');expect(bookName('1TH','eng')).toBe('1 Thessalonians');
  expect(bookName('SNG','spa')).toBe('Cantares');expect(bookName('2TH','spa')).toBe('2 Tesalonicenses');
  expect(bookName('MRK','xyz')).toBe('Mark');expect(pericopeName('nope')).toBeNull();
 });
});
