import { BookOpen, BookMarked, Users, Image, Map, Key, Film, Heart, Mountain, Layers, Drama, Puzzle, Speech, Ear } from 'lucide-svelte';

// One vocabulary for the progress bar, mini map and section transitions.
// Two sets that never share a glyph (cookbook design/alpha-system/tokens.md § Icon vocabulary, adopted 2026-10-08):
// content kinds — listen is an ear (not a speaking face), discuss is people, a key term is a key;
// the six stages — Hear and Heart, Setting the Stage, Defining the Scenes, Embodying the Text, Filling the Gaps, Speaking the Word.
export const contentIcons = { guide: Ear, scripture: BookOpen, discussion: Users, image: Image, map: Map, term: Key, video: Film };
export const sectionIcons = [Heart, Mountain, Layers, Drama, Puzzle, Speech];
// The passage control left of the stage cluster (cookbook progress-rail.md § Top band passage control, ticket ④): a closed book
// with a ribbon, never BookOpen, which is the scripture content kind; it belongs to neither set.
export const passageIcon = BookMarked;
// The word for each content kind, in user words (cookbook overview-sheet.md § Copy rules), in the key's reading order.
export const kindWords = { guide: 'listen', scripture: 'Scripture', discussion: 'discuss', term: 'key term', image: 'picture', map: 'map', video: 'video' };

// The passage line under the six stage icons (ticket 2026-10-15 passage-name-replaces-step-label): the current passage with its
// full book name, never a short code — abbreviations differ per language and readers do not understand them. The catalog
// title already carries the localized full name ("Mark 1:1–13", "Marcos 1:1–13"); these names only rebuild a line when a
// pack has no title or its title starts with a USFM code. Reference only: no heading or reference title is appended.
const BOOKS='GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ');
const names={
 eng:'Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|1 John|2 John|3 John|Jude|Revelation',
 spa:'Génesis|Éxodo|Levítico|Números|Deuteronomio|Josué|Jueces|Rut|1 Samuel|2 Samuel|1 Reyes|2 Reyes|1 Crónicas|2 Crónicas|Esdras|Nehemías|Ester|Job|Salmos|Proverbios|Eclesiastés|Cantares|Isaías|Jeremías|Lamentaciones|Ezequiel|Daniel|Oseas|Joel|Amós|Abdías|Jonás|Miqueas|Nahúm|Habacuc|Sofonías|Hageo|Zacarías|Malaquías|Mateo|Marcos|Lucas|Juan|Hechos|Romanos|1 Corintios|2 Corintios|Gálatas|Efesios|Filipenses|Colosenses|1 Tesalonicenses|2 Tesalonicenses|1 Timoteo|2 Timoteo|Tito|Filemón|Hebreos|Santiago|1 Pedro|2 Pedro|1 Juan|2 Juan|3 Juan|Judas|Apocalipsis'
};
export const bookNames=Object.fromEntries(Object.entries(names).map(([lang,list])=>[lang,Object.fromEntries(list.split('|').map((name,i)=>[BOOKS[i],name]))]));
export function bookName(code,language='eng'){return (bookNames[language]||bookNames.eng)[code]||bookNames.eng[code]||null;}
// A pericope id `MRK-1-1-13` (one chapter) or `MRK-2-23-3-6` (two chapters) reads `Mark 1:1–13` / `Mark 2:23–3:6`.
export function pericopeName(id,language='eng'){
 const m=/^([1-3A-Z][A-Z0-9]{2})-(\d+)-(\d+)(?:-(\d+))?(?:-(\d+))?$/.exec(id||'');if(!m)return null;
 const book=bookName(m[1],language);if(!book)return null;
 const [,,c,v,a,b]=m;return b?`${book} ${c}:${v}–${a}:${b}`:a?`${book} ${c}:${v}–${a}`:`${book} ${c}:${v}`;
}
export function passageName(pack={}){
 const code=/^([1-3A-Z][A-Z0-9]{2})\b/.exec(pack.title||'')?.[1];
 let name=pack.title||'';
 if(!name)name=pericopeName(pack.pericopeId,pack.language)||'';
 else if(code&&BOOKS.includes(code))name=name.replace(code,bookName(code,pack.language));
 return name;
}
