// V1-6: the Spanish text step strips AI sentence-start filler from generated text only (9/17 #17). Network-free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SPANISH_FILLER_INTERJECTIONS, SPANISH_FILLER_PREAMBLES, SPANISH_MEANING_BEARING_OPENERS, spokenText, stripPlanFiller, stripSpanishFiller } from '../src/spoken-text.mjs';

const hash = (b) => createHash('sha256').update(b).digest('hex');

test('the filler list is exactly these phrases, each with a provenance', () => {
  assert.deepEqual(SPANISH_FILLER_INTERJECTIONS.map((f) => f.phrase), ['Claro que sí', 'Claro', 'Bueno', 'Pues bien', 'Pues', 'Muy bien', 'Bien', 'Vale', 'De acuerdo', 'Perfecto', 'Excelente', 'Genial', 'Oye', 'Mira', 'O sea', 'En fin']);
  assert.deepEqual(SPANISH_FILLER_PREAMBLES.map((p) => p.example), ['Aquí tienes la traducción:', 'A continuación te presento el texto:']);
  for (const f of [...SPANISH_FILLER_INTERJECTIONS, ...SPANISH_FILLER_PREAMBLES, ...SPANISH_MEANING_BEARING_OPENERS]) assert.ok(f.from && f.from.length > 10, `no provenance: ${f.phrase || f.example}`);
});

test('each interjection is stripped at a sentence start, with the next word capitalized', () => {
  for (const { phrase } of SPANISH_FILLER_INTERJECTIONS) {
    const r = stripSpanishFiller(`${phrase}, el grupo lee el pasaje.`);
    assert.equal(r.text, 'El grupo lee el pasaje.', phrase);
    assert.deepEqual(r.removed, [`${phrase},`]);
  }
});

test('filler is stripped at every sentence start, in exclamations and preambles', () => {
  assert.equal(stripSpanishFiller('Bueno, lean Marcos 1. Claro, luego hablen. Pues, terminen.').text, 'Lean Marcos 1. Luego hablen. Terminen.');
  assert.equal(stripSpanishFiller('¡Claro! Aquí se ve el río Jordán.').text, 'Aquí se ve el río Jordán.');
  assert.equal(stripSpanishFiller('¡Claro, es el río Jordán!').text, '¡Es el río Jordán!');
  assert.equal(stripSpanishFiller('Aquí tienes la traducción: Sandalias. Observa los dedos.').text, 'Sandalias. Observa los dedos.');
  assert.equal(stripSpanishFiller('Claro, bueno, el grupo se detiene.').text, 'El grupo se detiene.');
  assert.equal(stripSpanishFiller('Primera línea.\nBueno, segunda línea.').text, 'Primera línea.\nSegunda línea.');
});

test('mid-sentence words and meaning-bearing openers are never stripped', () => {
  for (const { example } of SPANISH_MEANING_BEARING_OPENERS) assert.equal(stripSpanishFiller(example).text, example);
  for (const s of ['Jesús dijo: bueno, vengan.', 'El río es claro, y el agua es fría.', 'Esto está bien, pero no es todo.', 'Claridad es la meta.', 'Bienaventurados los que lloran.', 'Pueblo de Dios, escuchen.']) {
    assert.equal(stripSpanishFiller(s).text, s);
  }
  assert.equal(stripSpanishFiller('¡Claro!').text, '¡Claro!', 'a sentence that is only filler is left, never emptied');
});

test('only generated Spanish passes through the step', () => {
  assert.equal(spokenText('Bueno, lean.', { lang: 'spa', generated: false }).text, 'Bueno, lean.');
  assert.equal(spokenText('Bueno, lean.', { lang: 'eng', generated: true }).text, 'Bueno, lean.');
  assert.equal(spokenText('Bueno, lean.', { lang: 'spa', generated: true }).text, 'Lean.');
});

test('narration plan: generated scripts/texts are stripped and re-hashed; source slots untouched', () => {
  const entries = [
    { id: 'next-S02-U005', kind: 'next-action', script: 'Claro, deténganse aquí y miren el mapa.', sourceSha256: 'x', textProvenance: { status: 'generated' } },
    { id: 'desc-a204', kind: 'description', text: 'Sandalias. Observa los dedos.', sourceSha256: 'y', textProvenance: { status: 'generated' } },
    { id: 'S01-U001', kind: 'guide-unit', text: 'Bueno, esto es fuente.', sourceSha256: 'z' },
  ];
  assert.equal(stripPlanFiller(entries, 'spa', hash), 1);
  assert.equal(entries[0].script, 'Deténganse aquí y miren el mapa.');
  assert.equal(entries[0].sourceSha256, hash(Buffer.from('Deténganse aquí y miren el mapa.')));
  assert.deepEqual(entries[0].fillerStripped, ['Claro,']);
  assert.equal(entries[1].sourceSha256, 'y');
  assert.equal(entries[1].fillerStripped, undefined);
  assert.equal(entries[2].text, 'Bueno, esto es fuente.');
  assert.equal(stripPlanFiller([{ script: 'Bueno, stop.', textProvenance: { status: 'generated' } }], 'eng', hash), 0);
});
