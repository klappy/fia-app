import { BookOpen, Users, Image, Map, Key, Film, Ear, Heart, Mountain, Layers, PersonStanding, Puzzle, MicVocal } from 'lucide-svelte';

// One vocabulary for the progress strip, mini map and section transitions.
// Two disjoint sets (design book tokens § Icon vocabulary, proposed): no stage glyph is ever a content glyph.
// Content: listen = ear, discuss = two people, key term / fill the gaps = key (fb-04 S4).
export const contentIcons = { guide: Ear, scripture: BookOpen, discussion: Users, image: Image, map: Map, term: Key, video: Film };
// Stages 1–6: Hear and Heart, Setting the Stage, Defining the Scenes, Embodying the Text, Filling the Gaps, Speaking the Word.
// Stages 4–6 de-collided (proposed until Word Collective supplies the set, ASK C4).
export const sectionIcons = [Heart, Mountain, Layers, PersonStanding, Puzzle, MicVocal];
export const guideIcon = contentIcons.guide;
