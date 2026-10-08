import { BookOpen, Users, Image, Map, Key, Film, Heart, Mountain, Layers, Drama, Puzzle, Speech, Ear } from 'lucide-svelte';

// One vocabulary for the progress bar, mini map and section transitions.
// Two sets that never share a glyph (cookbook design/alpha-system/tokens.md § Icon vocabulary, adopted 2026-10-08):
// content kinds — listen is an ear (not a speaking face), discuss is people, a key term is a key;
// the six stages — Hear and Heart, Setting the Stage, Defining the Scenes, Embodying the Text, Filling the Gaps, Speaking the Word.
export const contentIcons = { guide: Ear, scripture: BookOpen, discussion: Users, image: Image, map: Map, term: Key, video: Film };
export const sectionIcons = [Heart, Mountain, Layers, Drama, Puzzle, Speech];
export const guideIcon = Ear;
