// Spanish coverage: DATA LAYER ONLY. No UI, no visible behaviour change, nothing imports this at runtime yet.
//
// Per item (pericope, resource, entity) it reports whether Spanish text EXISTS or the item would fall back to English /
// nothing, so a later UI can show an absence marker instead of a silent English fallback (captain, Nov 4 2026 3:08 PM ET).
//
//   pericope = a pack (one passage). Spanish text exists when a Spanish pack exists, its text capability is available and
//              every English guide step has a Spanish step (id for id).
//   resource = a picture, map or video asset (kind image | map | video). Spanish text exists when the Spanish pack carries the
//              asset with a non-empty title that is not the English title for the same asset id (title byte-identical to
//              English means the English title is being shown: 'english-fallback').
//   entity   = a key term (kind term), matched across languages by its term number (t<N>). Spanish text exists when the
//              Spanish pack has that term with non-empty text that is not the English text.
//
// Machine translation (MT) toggle, plumbing only. Default OFF. Only the captain turns it on, never automatically; the
// switch is an injected config value (no flag mechanism exists in fia-app today, so this adds none to the UI and reads
// no storage, no URL and no network). No translation provider is wired: with MT ON a missing item still resolves to the
// marker unless a caller supplies an already machine-translated string, which is then labelled machine-translated.
// Machine VOICES are not part of this module and stay banned.

export const MARKER = '[ES needed]';
export const STATE = Object.freeze({ PRESENT: 'present', MISSING: 'missing', ENGLISH_FALLBACK: 'english-fallback', MACHINE_TRANSLATED: 'machine-translated' });

/** Captain-controlled config. Anything other than an explicit `machineTranslation: true` is OFF. */
export function mtEnabled(config) { return config?.machineTranslation === true; }

const present = v => typeof v === 'string' && v.trim().length > 0;
const kindGroup = kind => kind === 'term' ? 'entity' : (kind === 'image' || kind === 'map' || kind === 'video') ? 'resource' : null;
const termNumber = id => { const m = /(?:^|-)t(\d+)(?:-|$)/.exec(String(id)); return m ? Number(m[1]) : null; };
const displayText = a => (a.kind === 'term' ? a.text : a.title);

/** Per-item report for one English pack and its Spanish counterpart (the Spanish pack may be absent). */
export function reportPack(eng, spa) {
  const items = [];
  const spaSteps = new Set((spa?.activities || []).map(a => a.id));
  const missingSteps = (eng.activities || []).filter(a => !spaSteps.has(a.id)).map(a => a.id);
  items.push({ group: 'pericope', id: spa?.id || eng.id, state: spa && missingSteps.length === 0 ? STATE.PRESENT : STATE.MISSING, missingSteps: spa ? missingSteps : (eng.activities || []).map(a => a.id) });
  const spaAssets = spa?.assets || {};
  const spaTerms = new Map(Object.values(spaAssets).filter(a => a.kind === 'term').map(a => [termNumber(a.id), a]));
  for (const [id, e] of Object.entries(eng.assets || {})) {
    const group = kindGroup(e.kind); if (!group) continue;
    const s = group === 'entity' ? spaTerms.get(termNumber(id)) : spaAssets[id];
    let state;
    if (!s || !present(displayText(s))) state = STATE.MISSING;
    else if (displayText(s) === displayText(e)) state = STATE.ENGLISH_FALLBACK;
    else state = STATE.PRESENT;
    items.push({ group, kind: e.kind, id, state });
  }
  return items;
}

/** What the UI should show for an item, given the config. Absence is never silent. */
export function resolveItem(item, { config, machineTranslated } = {}) {
  if (item.state === STATE.PRESENT) return { show: 'spanish', label: null };
  if (mtEnabled(config) && present(machineTranslated)) return { show: 'text', text: machineTranslated, label: STATE.MACHINE_TRANSLATED };
  return { show: 'marker', marker: MARKER, label: item.state };
}

/** Counts of pericopes / resources / entities with and without Spanish text. */
export function summarize(reports) {
  const out = { pericope: { total: 0, lacking: 0 }, resource: { total: 0, lacking: 0 }, entity: { total: 0, lacking: 0 } };
  const byState = {};
  for (const items of reports) for (const it of items) {
    out[it.group].total++; byState[it.group + ':' + it.state] = (byState[it.group + ':' + it.state] || 0) + 1;
    if (it.state !== STATE.PRESENT) out[it.group].lacking++;
  }
  return { ...out, byState };
}
