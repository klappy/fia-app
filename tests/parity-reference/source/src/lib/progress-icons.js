import { BookOpen, MessageCircle, Image, Map, WholeWord, Film, Heart, Users, Layers, Speech, Mountain } from 'lucide-svelte';

// One vocabulary for the progress strip, mini map and section transitions.
export const contentIcons = { guide: Speech, scripture: BookOpen, discussion: MessageCircle, image: Image, map: Map, term: WholeWord, video: Film };
export const sectionIcons = [Heart, Mountain, Layers, Users, WholeWord, Speech];
export const guideIcon = Speech;
