import { describe, it, expect } from 'vitest';
import { contentIcons, sectionIcons, guideIcon } from '../src/lib/progress-icons.js';

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
 it('listen is the guide glyph', () => { expect(guideIcon).toBe(contentIcons.guide); });
});
