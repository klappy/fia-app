/** Read-only source inventory. A declared delivery is not a network, decoding or playback receipt. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const kinds = ['image', 'map', 'video', 'term', 'scripture'];
const unique = values => [...new Set(values.filter(Boolean))];
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) && !/^0+$/.test(value);
export function readableText(asset) {
  return Boolean(asset?.text?.trim?.() || asset?.verses?.some(v => v.text?.trim?.()));
}
export function exactResources(activity) {
  return unique([activity?.assetId, ...(Array.isArray(activity?.relatedAssetIds) ? activity.relatedAssetIds : [])]);
}
export function displayedScreens(pack) {
  const activities = pack.activities || [];
  const together = (pack.listContracts || []).filter(c => c.layout === 'together');
  const hidden = new Set(together.flatMap(c => c.itemIds || []));
  return activities.filter(a => !hidden.has(a.id)).map(a => {
    const contract = together.find(c => c.introId === a.id);
    const ids = unique([a.id, ...(contract?.itemIds || [])]);
    const displayed = activities.filter(item => ids.includes(item.id));
    return { id: a.id, activityIds: ids, resources: unique(displayed.flatMap(exactResources)) };
  });
}
export function mediaDeclaration(asset, descriptor, deliveries = []) {
  const matching = deliveries.filter(d => d.packId === descriptor.id && d.presentationRevision === descriptor.revision)
    .flatMap(d => d.entries || []).filter(e => e.path === asset.src);
  const bound = Boolean(asset.src && matching.some(e => hash(e.delivery?.sha256) && e.delivery?.bytes > 0
    && e.delivery?.mime && e.delivery?.url && hash(e.source?.sha256) && e.source?.bytes > 0));
  const pending = JSON.stringify(asset.sourceEvidence || {}).includes('pending-transcode');
  const zeroHash = /"[^"]*[Ss]ha256":"0{64}"/.test(JSON.stringify(asset.sourceEvidence || {}));
  return { hasSrc: Boolean(asset.src), declaredDeliveryBound: bound, pending, zeroHash,
    publisherURLMetadata: Boolean(asset.sourceEvidence?.url) };
}
export function localPayloadBindings(bytes, entries) {
  const digest = createHash('sha256').update(bytes).digest('hex');
  const matches = record => record?.sha256 === digest && record?.bytes === bytes.length;
  return {
    source: entries.some(e => matches(e.source)),
    logical: entries.some(e => matches(e.logicalSource)),
    derivative: entries.some(e => [e.delivery, ...Object.values(e.variants || {}).map(v => v.delivery)].some(matches)),
  };
}
export function auditPack(pack, descriptor, deliveries = []) {
  const assets = pack.assets || {};
  const screens = displayedScreens(pack);
  const linked = new Set(screens.flatMap(s => s.resources));
  const unknownReferences = screens.flatMap(s => s.resources.filter(id => !assets[id]).map(id => ({ screen: s.id, asset: id })));
  const resources = Object.fromEntries(kinds.map(kind => {
    const all = Object.entries(assets).filter(([, a]) => a.kind === kind);
    const media = all.map(([, a]) => mediaDeclaration(a, descriptor, deliveries));
    return [kind, { catalogued: all.length, exactLinked: all.filter(([id]) => linked.has(id)).length,
      readableInline: all.filter(([, a]) => readableText(a)).length,
      withSrc: media.filter(a => a.hasSrc).length, declaredDeliveryBound: media.filter(a => a.declaredDeliveryBound).length,
      publisherURLMetadata: media.filter(a => a.publisherURLMetadata).length,
      pendingTranscode: media.filter(a => a.pending).length, zeroHash: media.filter(a => a.zeroHash).length }];
  }));
  return { id: descriptor.id, revision: descriptor.revision, activities: pack.activities.length, screens: screens.length,
    guideReviewLevel: pack.source?.guide?.reviewLevel ?? null, resources, unknownReferences,
    screensWithExactResources: screens.filter(s => s.resources.length).length,
    examples: screens.filter(s => s.resources.length).slice(0, 3),
    catalogWithoutExactScreenLink: Object.keys(assets).filter(id => !linked.has(id)),
    screensWithoutExactResources: screens.filter(s => !s.resources.length).length,
    guideNarrationPackagedMetadata: descriptor.capabilities?.guideNarration?.count || 0 };
}
export function auditCorpus(root) {
  const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const registry = read('apps/web/public/content/registry.json');
  const deliveryRoot = path.join(root, 'apps/web/public/content/delivery');
  const deliveries = fs.readdirSync(deliveryRoot, { recursive: true }).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(deliveryRoot, f), 'utf8')));
  const sourceRows = read('server/fia/preparation/guide-sources.json').rows;
  const admitted = read('server/fia/preparation/catalog.json').entries;
  const packs = registry.packs.map(d => {
    const presentation = read(`apps/web/public${d.presentation.url}`);
    const result = auditPack(presentation, d, deliveries);
    for (const kind of kinds) {
      const stats = result.resources[kind];
      stats.localPayloadNonempty = 0;
      stats.localPayloadSourceHashMatched = 0;
      stats.localPayloadLogicalHashMatched = 0;
      stats.localPayloadDerivativeHashMatched = 0;
      for (const asset of Object.values(presentation.assets).filter(a => a.kind === kind && a.src?.startsWith('/'))) {
        const filename = path.resolve(root, `apps/web/public${asset.src}`);
        if (!filename.startsWith(path.resolve(root, 'apps/web/public') + path.sep) || !fs.existsSync(filename)) continue;
        const bytes = fs.readFileSync(filename);
        if (!bytes.length) continue;
        stats.localPayloadNonempty++;
        const entries = deliveries.filter(m => m.packId === d.id && m.presentationRevision === d.revision)
          .flatMap(m => m.entries).filter(e => e.path === asset.src);
        const bindings = localPayloadBindings(bytes, entries);
        if (bindings.source) stats.localPayloadSourceHashMatched++;
        if (bindings.logical) stats.localPayloadLogicalHashMatched++;
        if (bindings.derivative) stats.localPayloadDerivativeHashMatched++;
      }
    }
    return result;
  });
  const groups = {};
  for (const language of ['eng', 'spa']) for (const book of ['MRK', 'LUK']) {
    const selected = packs.filter(p => p.id.startsWith(`${language}.${book}-`));
    const rows = sourceRows.filter(r => r.language === language && r.book === book);
    const entries = admitted.filter(e => selected.some(p => p.id === e.selection.packId && p.revision === e.selection.presentationRevision));
    groups[`${language}.${book}`] = { packs: selected.length, activities: selected.reduce((n,p) => n+p.activities,0),
      screens: selected.reduce((n,p) => n+p.screens,0),
      resources: Object.fromEntries(kinds.map(kind => [kind, Object.fromEntries(Object.keys(selected[0].resources[kind]).map(key =>
        [key, selected.reduce((n,p) => n+p.resources[kind][key],0)]))])),
      guideNarrationPackagedMetadata: selected.reduce((n,p) => n+p.guideNarrationPackagedMetadata,0),
      sourceURLRows: rows.length, sourceMetadataPacks: new Set(rows.map(r => r.packId)).size,
      admittedPreparationEntries: entries.length,
      admittedPreparationActivities: entries.reduce((n,e) => n+(e.accepted?.expected?.activities?.length || 0),0),
      guideReviewLevels: Object.fromEntries(unique(selected.map(p => p.guideReviewLevel ?? 'unspecified')).map(level =>
        [level, selected.filter(p => (p.guideReviewLevel ?? 'unspecified') === level).length])) };
  }
  return { schema: 'fia-summit-source-coverage@1', scope: 'All registered Mark/Luke English/Spanish presentations',
    limitations: ['Counts are per-pack occurrences, not unique media.', 'Exact links describe authored screen relationships, not observed rendering.',
      'No catalogued resource is not proof an editorial resource is required.', 'Delivery bindings are declarations; localPayload hash counts separately verify publisher-source, logical-source and delivery/variant bytes. A logical-source derivative need not match publisher original; none proves decoding, audible or device acceptance.',
      'Source URL absence does not prove publisher audio absence; packaged metadata does not exhaust runtime preparation.',
      'No network acquisition, translation, corpus mutation or acceptance performed.'],
    totalPacks: packs.length, totalActivities: packs.reduce((n,p) => n+p.activities,0), groups, packs };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(auditCorpus(path.resolve(process.argv[2] || '.')), null, 2)}\n`);
}
