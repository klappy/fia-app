import { BookOpen, Users, Image, Map, Key, Film, Heart, Mountain, Layers, Drama, Puzzle, Speech, Ear } from 'lucide-svelte';

// One vocabulary for the progress bar, mini map and section transitions.
// Two sets that never share a glyph (cookbook design/alpha-system/tokens.md § Icon vocabulary, adopted 2026-10-08):
// content kinds — listen is an ear (not a speaking face), discuss is people, a key term is a key;
// the six stages — Hear and Heart, Setting the Stage, Defining the Scenes, Embodying the Text, Filling the Gaps, Speaking the Word.
export const contentIcons = { guide: Ear, scripture: BookOpen, discussion: Users, image: Image, map: Map, term: Key, video: Film };
export const sectionIcons = [Heart, Mountain, Layers, Drama, Puzzle, Speech];
// The word for each content kind, in user words (cookbook overview-sheet.md § Copy rules), in the key's reading order.
export const kindWords = { guide: 'listen', scripture: 'Scripture', discussion: 'discuss', term: 'key term', image: 'picture', map: 'map', video: 'video' };

// The passage line under the six stage icons (ticket 2026-10-15 passage-name-replaces-step-label; harvest H15-06):
// the current pericope by its full book name, never a short code (codes differ per language and readers do not know them),
// plus its heading when the passage supplies one. Catalog titles already carry the full name ("Mark 1:1–13",
// "Marcos 1:1–13"); a title or pericope id that leads with a USFM code is expanded here so a code never reaches the screen.
const BOOKS={
 GEN:['Genesis','Génesis'],EXO:['Exodus','Éxodo'],LEV:['Leviticus','Levítico'],NUM:['Numbers','Números'],DEU:['Deuteronomy','Deuteronomio'],
 JOS:['Joshua','Josué'],JDG:['Judges','Jueces'],RUT:['Ruth','Rut'],'1SA':['1 Samuel','1 Samuel'],'2SA':['2 Samuel','2 Samuel'],
 '1KI':['1 Kings','1 Reyes'],'2KI':['2 Kings','2 Reyes'],'1CH':['1 Chronicles','1 Crónicas'],'2CH':['2 Chronicles','2 Crónicas'],
 EZR:['Ezra','Esdras'],NEH:['Nehemiah','Nehemías'],EST:['Esther','Ester'],JOB:['Job','Job'],PSA:['Psalms','Salmos'],PRO:['Proverbs','Proverbios'],
 ECC:['Ecclesiastes','Eclesiastés'],SNG:['Song of Solomon','Cantar de los Cantares'],ISA:['Isaiah','Isaías'],JER:['Jeremiah','Jeremías'],
 LAM:['Lamentations','Lamentaciones'],EZK:['Ezekiel','Ezequiel'],DAN:['Daniel','Daniel'],HOS:['Hosea','Oseas'],JOL:['Joel','Joel'],AMO:['Amos','Amós'],
 OBA:['Obadiah','Abdías'],JON:['Jonah','Jonás'],MIC:['Micah','Miqueas'],NAM:['Nahum','Nahúm'],HAB:['Habakkuk','Habacuc'],ZEP:['Zephaniah','Sofonías'],
 HAG:['Haggai','Hageo'],ZEC:['Zechariah','Zacarías'],MAL:['Malachi','Malaquías'],
 MAT:['Matthew','Mateo'],MRK:['Mark','Marcos'],LUK:['Luke','Lucas'],JHN:['John','Juan'],ACT:['Acts','Hechos'],ROM:['Romans','Romanos'],
 '1CO':['1 Corinthians','1 Corintios'],'2CO':['2 Corinthians','2 Corintios'],GAL:['Galatians','Gálatas'],EPH:['Ephesians','Efesios'],
 PHP:['Philippians','Filipenses'],COL:['Colossians','Colosenses'],'1TH':['1 Thessalonians','1 Tesalonicenses'],'2TH':['2 Thessalonians','2 Tesalonicenses'],
 '1TI':['1 Timothy','1 Timoteo'],'2TI':['2 Timothy','2 Timoteo'],TIT:['Titus','Tito'],PHM:['Philemon','Filemón'],HEB:['Hebrews','Hebreos'],
 JAS:['James','Santiago'],'1PE':['1 Peter','1 Pedro'],'2PE':['2 Peter','2 Pedro'],'1JN':['1 John','1 Juan'],'2JN':['2 John','2 Juan'],
 '3JN':['3 John','3 Juan'],JUD:['Jude','Judas'],REV:['Revelation','Apocalipsis'],
};
export function bookName(code,language='eng'){const names=BOOKS[String(code||'').toUpperCase()];return names?names[language==='spa'?1:0]:null;}
// "MRK-1-1-13" → "Mark 1:1–13"; "MRK-2-23-3-6" → "Mark 2:23–3:6". Null when the id is not a USFM pericope id.
export function pericopeReference(pericopeId,language='eng'){
 const m=/^([1-3]?[A-Z]{2,3})-(\d+)-(\d+)-(\d+)(?:-(\d+))?$/.exec(String(pericopeId||''));if(!m)return null;
 const name=bookName(m[1],language);if(!name)return null;
 return m[5]?`${name} ${m[2]}:${m[3]}–${m[4]}:${m[5]}`:`${name} ${m[2]}:${m[3]}–${m[4]}`;
}
export function passageName(pack){
 if(!pack)return '';
 const language=pack.language||'eng';let title=String(pack.title||'').trim();
 const code=/^([1-3]?[A-Z]{2,3})\b\s*(.*)$/.exec(title);
 if(code&&bookName(code[1],language))title=`${bookName(code[1],language)}${code[2]?` ${code[2]}`:''}`;
 if(!title)title=pericopeReference(pack.pericopeId,language)||'';
 const heading=String(pack.heading||'').trim();
 return heading&&title?`${title} · ${heading}`:title||heading;
}
