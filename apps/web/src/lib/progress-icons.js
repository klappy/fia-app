import { BookOpen, Users, Image, Map, Key, Film, Ear, Heart, Mountain, Layers, Drama, Puzzle, Speech } from 'lucide-svelte';

// One vocabulary for the progress strip, mini map and section transitions.
// Two disjoint sets (design book tokens § Icon vocabulary, adopted 2026-10-08): no stage glyph is ever a content glyph.
// Content: listen = ear, discuss = two people, key term / fill the gaps = key (fb-04 S4).
export const contentIcons = { guide: Ear, scripture: BookOpen, discussion: Users, image: Image, map: Map, term: Key, video: Film };
// Stages 1–6: Hear and Heart, Setting the Stage, Defining the Scenes, Embodying the Text, Filling the Gaps, Speaking the Word.
// Stage 4 users → drama, 5 whole-word → puzzle; 6 keeps speech (now means speaking, since listening moved to ear). Word Collective may replace the six (ASK C4).
export const sectionIcons = [Heart, Mountain, Layers, Drama, Puzzle, Speech];
export const guideIcon = contentIcons.guide;
