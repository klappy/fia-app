// V1-6 (cookbook BUILD-ORDER.md:98; 9/17 #17, cookbook work/done/2026-09-30-fia-demo-0917-harvest/HARVEST.md:39):
// AI-written Spanish adds conversational filler at sentence starts ("Claro, ...", "Bueno, ..."), and the voice then
// reads it aloud. This text step removes that filler from GENERATED Spanish text before B6c voices it. It never touches
// source text (Aquifer guide, scripture, term bodies): those are human-authored and their openers carry meaning.
//
// Borrow check: klappy/fia-functional-poc @62a979f has no filler list or regex. Its Spanish request text processing
// (src/data/spanish-audio-catalog.json, processedTextSha256) normalizes punctuation only. So the list below is seeded
// here; each phrase says where it came from, and a native speaker confirms it with the B6c audition (R-510).
//
// Rule: a phrase is stripped only when it opens a sentence AND is set off as an interjection (a following comma or a
// closing "!"), or, for preambles, only when it is a whole sentence ending in ":" before the real text. A bare word that
// begins a meaning-bearing clause ("Mira hacia el interior ...", "Entonces Dios restaura ...") is never stripped.

const HARVEST = 'cookbook work/done/2026-09-30-fia-demo-0917-harvest/HARVEST.md:39 (9/17 #17: "AI Spanish adds filler at sentence starts")';
const GUESS = '(guess) common Spanish spoken discourse marker / chat-assistant opener; class named at ' + HARVEST + '; confirm in the B6c native-speaker audition';

/** Interjection fillers: stripped only as "<phrase>," or "¡<phrase>!" at a sentence start. */
export const SPANISH_FILLER_INTERJECTIONS = [
  { phrase: 'Claro que sí', from: GUESS },
  { phrase: 'Claro', from: GUESS },
  { phrase: 'Bueno', from: GUESS },
  { phrase: 'Pues bien', from: GUESS },
  { phrase: 'Pues', from: GUESS },
  { phrase: 'Muy bien', from: GUESS },
  { phrase: 'Bien', from: GUESS },
  { phrase: 'Vale', from: GUESS },
  { phrase: 'De acuerdo', from: GUESS },
  { phrase: 'Perfecto', from: GUESS },
  { phrase: 'Excelente', from: GUESS },
  { phrase: 'Genial', from: GUESS },
  { phrase: 'Oye', from: GUESS },
  { phrase: 'Mira', from: GUESS },
  { phrase: 'O sea', from: GUESS },
  { phrase: 'En fin', from: GUESS },
];

/** Whole-sentence preambles ("Aquí tienes la traducción:") dropped only when they end in ":" before the real text. */
export const SPANISH_FILLER_PREAMBLES = [
  { pattern: /^aquí (?:tienes|tiene|está|va) (?:la|el|una|un)\b[^.!?:]{0,60}:/iu, example: 'Aquí tienes la traducción:', from: GUESS },
  { pattern: /^a continuación(?:,)? (?:te |le )?(?:presento|muestro|comparto)\b[^.!?:]{0,60}:/iu, example: 'A continuación te presento el texto:', from: GUESS },
];

/**
 * Openers that look like filler but carry meaning in FIA's own Spanish text, so they are never on the list.
 * Each was found at a sentence start in the PoC's voiced Spanish (src/data/spanish-audio-catalog.json @62a979f).
 */
export const SPANISH_MEANING_BEARING_OPENERS = [
  { phrase: 'Entonces', example: 'Entonces Dios restaura su relación con ellos.', from: 'fia-functional-poc@62a979f src/data/spanish-audio-catalog.json#spa-f0818745f7e2f8795208' },
  { phrase: 'Ahora', example: 'Ahora, el grupo debe crear una gráfica, dibujar o usar objetos para visualizar el pasaje', from: 'fia-functional-poc@62a979f src/data/spanish-audio-catalog.json#spa-cd0770793f13d69393cd' },
  { phrase: 'Por supuesto', example: 'Por supuesto, Dios no puede pecar y no necesita arrepentirse de algo malo que ha hecho.', from: 'fia-functional-poc@62a979f src/data/spanish-audio-catalog.json#spa-c6ecc2229d3e7c074cfd' },
  { phrase: 'Aquí hay', example: 'Aquí hay un breve resumen de estos cuatro términos diferentes:', from: 'fia-functional-poc@62a979f src/data/spanish-audio-catalog.json#spa-12ce442c4039d622e323' },
  { phrase: 'Mira (no comma)', example: 'Mira sus pies para ver cómo lleva puestas las sandalias.', from: 'fia-functional-poc@62a979f src/data/spanish-audio-catalog.json#visual-description-ai-spa-from-a203' },
  { phrase: 'Este', example: 'Este pasaje tiene 4 escenas.', from: 'fia-functional-poc@62a979f src/data/spanish-audio-catalog.json#spa-71a26bbde754b0a00ba2' },
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternation = SPANISH_FILLER_INTERJECTIONS.map((f) => escape(f.phrase)).sort((a, b) => b.length - a.length).join('|');
// "Claro, ..." / "Claro: ..." / "¡Claro! ..." / "¡Claro, ...!" at the start of a sentence (leading ¡ optional).
const INTERJECTION = new RegExp(`^¡?(${alternation})(?:\\s*[,:]\\s*|\\s*!\\s+)`, 'iu');

const WHOLE_EXCLAMATION = new RegExp(`^¡?(${alternation})$`, 'iu');
const upperFirst = (s) => s.replace(/^([¿¡"“«(]*)(\p{Ll})/u, (_, lead, c) => lead + c.toLocaleUpperCase('es'));

function stripSentence(sentence, removed) {
  let s = sentence;
  for (;;) {
    const pre = SPANISH_FILLER_PREAMBLES.find((p) => p.pattern.test(s));
    if (pre) { const m = s.match(pre.pattern)[0]; removed.push(m.trim()); s = s.slice(m.length).trimStart(); continue; }
    const m = s.match(INTERJECTION);
    if (!m) break;
    const rest = s.slice(m[0].length);
    if (!/\p{L}/u.test(rest)) break; // the filler is the whole sentence: leave it rather than empty the text
    removed.push(m[0].trim());
    // an opening "¡" whose "!" closes later in the sentence stays balanced: "¡Claro, es Dios!" -> "¡Es Dios!"
    s = (m[0].startsWith('¡') && !m[0].includes('!') ? '¡' : '') + rest;
  }
  return s === sentence ? s : upperFirst(s);
}

/**
 * Remove sentence-start filler from AI-generated Spanish text. Returns { text, removed } — removed lists each
 * stripped opener in order, so the narration plan can record what the text step changed.
 */
export function stripSpanishFiller(text) {
  const removed = [];
  // split keeps sentence boundaries (after . ! ? … or a newline), so only sentence starts are examined
  const parts = String(text).split(/((?:[.!?…]["”»)]*\s+)|\n+)/u);
  // "¡Claro! Aquí ..." splits into a sentence that is only filler; drop it (and its "! ") when real text follows
  for (let i = 0; i + 2 < parts.length; i += 2) {
    if (WHOLE_EXCLAMATION.test(parts[i]) && /^!/.test(parts[i + 1]) && /\p{L}/u.test(parts.slice(i + 2).join(''))) {
      removed.push(`${parts[i]}!`);
      parts[i] = ''; parts[i + 1] = '';
      parts[i + 2] = upperFirst(parts[i + 2]);
    }
  }
  const out = parts.map((p, i) => (i % 2 === 0 && p ? stripSentence(p, removed) : p)).join('');
  return { text: out, removed };
}

/**
 * The pipeline text step for spoken text: only generated (AI) Spanish text is filtered; source text and other
 * languages pass through unchanged.
 */
export function spokenText(text, { lang, generated }) {
  if (lang !== 'spa' || !generated || typeof text !== 'string') return { text, removed: [] };
  return stripSpanishFiller(text);
}

/**
 * Apply the text step to narration-plan entries that carry generated text (`text` for descriptions, `script` for
 * next-action / transition prompts, both marked textProvenance.status === 'generated'). A changed entry gets the new
 * text, a new sourceSha256 and `fillerStripped`. Returns how many entries changed.
 */
export function stripPlanFiller(entries, lang, hash) {
  let changed = 0;
  for (const e of entries) {
    if (e.textProvenance?.status !== 'generated') continue;
    for (const field of ['text', 'script']) {
      if (typeof e[field] !== 'string') continue;
      const r = spokenText(e[field], { lang, generated: true });
      if (!r.removed.length) continue;
      e[field] = r.text;
      e.sourceSha256 = hash(Buffer.from(r.text));
      e.fillerStripped = [...(e.fillerStripped || []), ...r.removed];
      changed++;
    }
  }
  return changed;
}
