// Read-only audit: how many pericopes, resources and entities lack Spanish text today. Usage: node scripts/spanish-coverage-audit.mjs [--json]
import { readFileSync } from 'node:fs';
import { reportPack, summarize } from '../apps/web/src/lib/spanish-coverage.js';
const root = new URL('../apps/web/public/content/', import.meta.url);
const registry = JSON.parse(readFileSync(new URL('registry.json', root), 'utf8'));
const load = p => JSON.parse(readFileSync(new URL(p.presentation.url.replace(/^\/content\//, ''), root), 'utf8'));
const byId = new Map(registry.packs.map(p => [p.id, p]));
const reports = [];
for (const p of registry.packs) {
  if (p.language !== 'eng') continue;
  const s = byId.get('spa.' + p.pericopeId);
  reports.push(reportPack(load(p), s ? load(s) : null, s));
}
const sum = summarize(reports);
sum.lackingPericopes = reports.flatMap(r => r.filter(i => i.group === 'pericope' && i.state !== 'present').map(i => ({ id: i.id, missingSteps: i.missingSteps.length })));
console.log(JSON.stringify(sum, null, 2));
