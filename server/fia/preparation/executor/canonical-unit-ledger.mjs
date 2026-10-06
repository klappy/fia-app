import {gunzipSync} from 'node:zlib';
import {sha256,canonicalJSONString} from '../contract.mjs';
export const P1_CANONICAL_LEDGER_PINS=Object.freeze({
 ledger:'23f791de6a6e670f7e93fe6d0c20fb558e8bd12f8a24669d7a6c44a11c876380',
 sourcePacks:'48f8c768b108f2b9977048db26fa54c82af4eea7f54c66fa650ef84f7d61ecd7',
 presentation:'ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975',
 bundle:'faa53e9e954dcf0f0661e3551f6fb96a9f4f2f532fff2d90ab128b4eab5d8843',
});
const equal=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
function need(value,reason){if(!value)throw Error(`canonical-ledger-${reason}`);}
function unique(rows,key){need(Array.isArray(rows),'rows');const m=new Map();for(const r of rows){need(typeof r?.[key]==='string'&&!m.has(r[key]),'duplicate-or-invalid-id');m.set(r[key],r);}return m;}
async function pinned(bytes,key){need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=32*1024*1024,'bytes');const copy=bytes.slice();need(await sha256(copy)===P1_CANONICAL_LEDGER_PINS[key],`${key}-hash`);return copy;}
const parse=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
/** Separate P1 source representation, not a narration adapter or acceptance API.
 * All four retained artifacts are required; no network or runtime wiring.
 * Associations describe approved presentation lineage, not verified audio spans.
 */
export async function createCanonicalUnitLedgerResolver({ledgerBytes,sourcePackBytes,presentationBytes,bundleBytes}){
 const copies=await Promise.all([pinned(ledgerBytes,'ledger'),pinned(sourcePackBytes,'sourcePacks'),pinned(presentationBytes,'presentation'),pinned(bundleBytes,'bundle')]);
 const [ledger,source,presentation,bundle]=[parse(copies[0]),parse(gunzipSync(copies[1],{maxOutputLength:128*1024*1024})),parse(copies[2]),parse(copies[3])];
 const pack=source.packs?.['eng.MRK-1-1-13'],guide=pack?.guide;
 need(ledger.schema==='fia-canonical-source-unit-ledger@1'&&ledger.packId===guide?.packId&&ledger.sourceId===guide.sourceId&&ledger.guideContentSha256===guide.contentSha256&&ledger.grantsPlaybackAcceptance===false,'identity');
 need(equal(ledger.pins,Object.fromEntries(Object.entries(P1_CANONICAL_LEDGER_PINS).filter(([k])=>k!=='ledger'))),'pins');
 const canonical=guide.steps.flatMap(s=>s.units.map(u=>({...u,sectionId:s.id}))),rows=unique(ledger.units,'sourceUnitId'),sourceRows=unique(canonical,'id'),bundleRows=unique(bundle.sourceUnits,'id'),coverage=unique(presentation.coverage,'id'),activities=unique(presentation.activities,'id'),examples=unique(presentation.examples,'id'),bundleActivities=unique(bundle.activities,'id');
 need(rows.size===sourceRows.size&&bundleRows.size===sourceRows.size&&coverage.size===sourceRows.size,'complete-corpus');
 for(const [i,u] of canonical.entries()){
  const r=rows.get(u.id),b=bundleRows.get(u.id),c=coverage.get(u.id);
  need(r&&b&&c&&ledger.units[i].sourceUnitId===u.id&&r.sectionId===u.sectionId,'unit-membership-order');
  need(r.text===u.text&&r.text===b.text&&r.sourceTextSha256===u.textSha256&&r.sourceTextSha256===b.textSha256&&b.sourceSha256===r.sourceTextSha256&&await sha256(r.text)===r.sourceTextSha256,'canonical-text');
  need(r.disposition===b.disposition&&equal(r.activityIds,b.activityIds)&&r.associatedActivityId===b.associatedActivityId&&r.coverageTreatment===c.treatment,'disposition');
  need(r.narrationRole===({'production-request':'not-spoken-production-note','source-detail':'associated-pause-no-independent-range'}[r.disposition]??'not-assessed'),'narration-role');
  need(new Set(r.activityIds).size===r.activityIds.length,'duplicate-association');
  for(const id of r.activityIds){const a=bundleActivities.get(id);need(a&&(a.sourceUnitId===u.id||a.fulfills===u.id)&&a.sectionId===r.sectionId,'activity-association');}
  if(r.associatedActivityId!==null)need(activities.get(r.associatedActivityId)?.sectionId===r.sectionId,'associated-activity');
  if(r.disposition==='default')need(r.activityIds.length>0&&activities.get(u.id)?.sourceSha256===r.sourceTextSha256,'default');
  else if(r.disposition==='optional-example')need(examples.get(u.id)?.sha256===r.sourceTextSha256,'example');
  else if(r.disposition==='source-detail')need(r.activityIds.length===0&&r.associatedActivityId&&c.treatment==='pause spoken in preceding reviewed recording','pause');
  else if(r.disposition==='production-request')need(r.activityIds.length===0&&r.associatedActivityId&&c.treatment==='production media request, retained in source; maps available','production-note');
  else throw Error('canonical-ledger-unsupported-disposition');
 }
 return function resolve({packId,sectionId,presentationSha256}){
  need(presentationSha256===P1_CANONICAL_LEDGER_PINS.presentation,'presentation-revision');
  need(packId===ledger.packId&&guide.steps.some(s=>s.id===sectionId),'selection');
  return structuredClone({schema:ledger.schema,ledgerSha256:P1_CANONICAL_LEDGER_PINS.ledger,pins:ledger.pins,packId,sectionId,guideContentSha256:ledger.guideContentSha256,units:ledger.units.filter(u=>u.sectionId===sectionId),grantsPlaybackAcceptance:false});
 };
}
