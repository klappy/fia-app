import { describe, it, expect } from 'vitest';
import { Ear } from 'lucide-svelte';
import { contentIcons, sectionIcons, passageName, pericopeReference, bookName } from '../src/lib/progress-icons.js';

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

describe('passage name under the stage icons (ticket 2026-10-15 ①)', () => {
 it('keeps catalog titles that already carry the full name, English and Spanish', () => {
  expect(passageName({ language: 'eng', title: 'Mark 1:1–13' })).toBe('Mark 1:1–13');
  expect(passageName({ language: 'spa', title: 'Marcos 1:1–13' })).toBe('Marcos 1:1–13');
 });
 it('never shows a short code: a leading USFM code is expanded per language', () => {
  expect(passageName({ language: 'eng', title: 'LUK 2:1–20' })).toBe('Luke 2:1–20');
  expect(passageName({ language: 'spa', title: 'LUK 2:1–20' })).toBe('Lucas 2:1–20');
  expect(passageName({ language: 'eng', title: '1TH 4:13–18' })).toBe('1 Thessalonians 4:13–18');
 });
 it('falls back to the pericope id, cross-chapter ranges included', () => {
  expect(pericopeReference('MRK-2-23-3-6', 'eng')).toBe('Mark 2:23–3:6');
  expect(passageName({ language: 'spa', pericopeId: 'SNG-1-1-17' })).toBe('Cantar de los Cantares 1:1–17');
  expect(pericopeReference('not-a-pericope')).toBeNull();
  expect(bookName('XYZ')).toBeNull();
 });
 it('adds the heading when one is supplied', () => {
  expect(passageName({ language: 'eng', title: 'Luke 15:11–32', heading: 'The Parable of the Lost Son' })).toBe('Luke 15:11–32 · The Parable of the Lost Son');
  expect(passageName(null)).toBe('');
 });
});
