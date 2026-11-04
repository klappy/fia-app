// Spanish coverage: DATA LAYER ONLY. No UI, no visible behaviour change, nothing imports this at runtime yet.
//
// Per item (pericope, resource, entity) it reports whether Spanish text EXISTS or the item would fall back to English /
// nothing, so a later UI can show an absence marker instead of a silent English fallback (captain, Nov 4 2026 3:08 PM ET).
//
//   pericope = a pack (one passage). Spanish text exists when a Spanish pack exists, its text capability is available and
//              every English guide unit has a Spanish counterpart. Guide units are compared, not
//              expanded activities: an activity's unit is its sourceUnitId, else the unit it fulfills, else its own id.
//              The text capability comes from the Spanish registry descriptor (capabilities.text.available === true);
//              presentation JSON does not carry it, so callers must pass the descriptor. Without it, Spanish is absent.
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

export const guideUnit = a => a.sourceUnitId || a.fulfills || a.id;
const units = pack => [...new Set((pack?.activities || []).map(guideUnit))];
export const textAvailable = descriptor => descriptor?.capabilities?.text?.available === true;

/**
 * Per-item report for one English pack and its Spanish counterpart (the Spanish pack may be absent).
 * `spaDescriptor` is the Spanish pack's registry entry; its text capability must be explicitly available,
 * otherwise the Spanish pack is treated as absent so the marker is never suppressed.
 */
export function reportPack(eng, spaPack, spaDescriptor) {
  const items = [];
  const disabled = !!spaPack && !textAvailable(spaDescriptor);
  const spa = disabled ? null : spaPack;
  const spaUnits = new Set(units(spa));
  const missingSteps = units(eng).filter(u => !spaUnits.has(u));
  items.push({ group: 'pericope', id: spaPack?.id || eng.id, state: spa && missingSteps.length === 0 ? STATE.PRESENT : STATE.MISSING, missingSteps, ...(disabled ? { reason: 'text-unavailable' } : {}) });
  const spaAssets = spa?.assets || {};
  const spaTerms = new Map(Object.values(spaAssets).filter(a => a.kind === 'term').map(a => [termNumber(a.id), a]));
  for (const [id, e] of Object.entries(eng.assets || {})) {
    const group = kindGroup(e.kind); if (!group) continue;
    const s = group === 'entity' ? spaTerms.get(termNumber(id)) : spaAssets[id];
    let state;
    if (!s || !present(displayText(s))) state = STATE.MISSING;
    else if (displayText(s) === displayText(e)) state = STATE.ENGLISH_FALLBACK;
    else state = STATE.PRESENT;
    items.push({ group, kind: e.kind, id, key: group === 'entity' ? 't' + termNumber(id) : id, state });
  }
  return items;
}

/** What the UI should show for an item, given the config. Absence is never silent. */
export function resolveItem(item, { config, machineTranslated } = {}) {
  if (item.state === STATE.PRESENT) return { show: 'spanish', label: null };
  if (mtEnabled(config) && present(machineTranslated)) return { show: 'text', text: machineTranslated, label: STATE.MACHINE_TRANSLATED };
  return { show: 'marker', marker: MARKER, label: item.state };
}

/**
 * Counts of pericopes / resources / entities with and without Spanish text. Resources and entities are reused across
 * packs, so they are deduplicated (resource by asset id, entity by term number): a unique item is lacking if it lacks
 * Spanish in any pack where it appears, since the marker would show there. Pericopes are one per pack.
 * `occurrences` keeps the old per-pack counts for reference.
 */
export function summarize(reports) {
  const out = { pericope: { total: 0, lacking: 0 }, resource: { total: 0, lacking: 0 }, entity: { total: 0, lacking: 0 } };
  const occurrences = { resource: { total: 0, lacking: 0 }, entity: { total: 0, lacking: 0 } };
  const byState = {};
  const uniq = { resource: new Map(), entity: new Map() };
  for (const items of reports) for (const it of items) {
    const lacking = it.state !== STATE.PRESENT;
    if (it.group === 'pericope') { out.pericope.total++; if (lacking) out.pericope.lacking++; byState['pericope:' + it.state] = (byState['pericope:' + it.state] || 0) + 1; continue; }
    occurrences[it.group].total++; if (lacking) occurrences[it.group].lacking++;
    const key = it.key ?? it.id, m = uniq[it.group], prev = m.get(key);
    if (!prev || (prev === STATE.PRESENT && lacking)) m.set(key, it.state);
  }
  for (const g of ['resource', 'entity']) for (const st of uniq[g].values()) {
    out[g].total++; if (st !== STATE.PRESENT) out[g].lacking++; byState[g + ':' + st] = (byState[g + ':' + st] || 0) + 1;
  }
  return { ...out, byState, occurrences };
}
