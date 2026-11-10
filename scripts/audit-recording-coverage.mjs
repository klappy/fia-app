/** Repository evidence only: never equate a discovery URL or preparation admission with device playback. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {projectPreparationAvailability} from '../apps/web/build/preparation-availability.js';
import {projectScripturePassageBindings} from '../apps/web/build/scripture-passage-availability.js';
import {hasGuidePreparation,guideRecordingAvailability,declaresScripturePassage} from '../apps/web/src/lib/recording-availability.js';
export function selectedGuideUnits(presentation,descriptor,admissions){
 return presentation.activities.filter(a=>a.sourceUnitId).map(a=>{
  const identity={activityId:a.id,sourceUnitId:a.sourceUnitId,sourceTextSha256:a.sourceSha256};
  return {...identity,admitted:hasGuidePreparation(descriptor,identity,admissions),audioSrc:a.audioSrc||null};
 });
}
export function auditRecordingCoverage(root){
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
 const registry=read('apps/web/public/content/registry.json');
 const sources=read('server/fia/preparation/guide-sources.json').rows;
 const admissions=projectPreparationAvailability(read('server/fia/preparation/catalog.json'));
 const sidecars=id=>{
  const directory=path.join(root,'apps/web/public/content/delivery',id);
  return fs.existsSync(directory)?fs.readdirSync(directory).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(fs.readFileSync(path.join(directory,n)))):[];
 };
 const scriptureBindings=projectScripturePassageBindings(registry,sidecars);
 const local=src=>{
  if(!src?.startsWith('/'))return {localNonempty:false};
  const filename=path.resolve(root,`apps/web/public${src}`);
  if(!filename.startsWith(path.resolve(root,'apps/web/public')+path.sep)||!fs.existsSync(filename))return {localNonempty:false};
  const bytes=fs.readFileSync(filename);
  return {localNonempty:bytes.length>0,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 };
 const packs=registry.packs.map(d=>{
  const p=read(`apps/web/public${d.presentation.url}`),rows=sources.filter(r=>r.packId===d.id);
  const current=rows.filter(r=>r.presentationRevision===d.revision&&r.language===d.language&&r.edition==='fia-guide');
  const units=selectedGuideUnits(p,d,admissions).map(u=>({...u,...local(u.audioSrc),
   discoveryIdentityMatched:current.some(r=>r.sourceUnits?.some(s=>s.sourceUnitId===u.sourceUnitId&&s.sourceTextSha256===u.sourceTextSha256))}));
  const scriptures=Object.values(p.assets).filter(a=>a.kind==='scripture').map(a=>{
   const declared=declaresScripturePassage(d,a.id,scriptureBindings);
   const entry=sidecars(d.id).filter(s=>s.presentationRevision===d.revision).flatMap(s=>s.entries).find(e=>e.scriptureRangeOnly?.assetId===a.id&&e.scripturePlaybackMode==='passage-only');
   const audioPath=a.audioSrc||a.descriptionAudio;
   const payload=local(entry?.path||audioPath);
   return {assetId:a.id,readableText:Boolean(a.text?.trim()||a.verses?.some(v=>v.text?.trim())),passageRecordingDeclared:declared,
    audioSrcDeclared:Boolean(audioPath),audioPath:entry?.path||audioPath||null,...payload,
    localDeliveryHashMatched:Boolean(payload.localNonempty&&[entry?.delivery,...Object.values(entry?.variants||{}).map(v=>v.delivery)].some(v=>v?.sha256===payload.sha256&&v?.bytes===payload.bytes))};
  });
  return {id:d.id,revision:d.revision,language:d.language,book:d.pericopeId.slice(0,3),
   discovery:{rows:rows.length,currentRevisionRows:current.length,staleRows:rows.length-current.length,urls:current.map(r=>r.sourceURL),grantsProductionPlayback:false},
   guide:{runtimeAvailabilityLabel:guideRecordingAvailability(d,admissions),packagedCapabilityCount:d.capabilities?.guideNarration?.count||0,
    selectedUnits:units.length,discoveryIdentityMatchedUnits:units.filter(u=>u.discoveryIdentityMatched).length,admittedSelectedUnits:units.filter(u=>u.admitted).length,localNonemptyUnits:units.filter(u=>u.localNonempty).length,
    unitsWithoutAdmissionOrLocalBytes:units.filter(u=>!u.admitted&&!u.localNonempty).map(u=>u.sourceUnitId),units},
   scripture:{capability:d.capabilities?.scriptureAudio||null,assets:scriptures},
   productionPlayback:'unverified: requires exact deployed runtime/device checks; discovery execution is DEV-origin gated'};
 });
 const groups={};for(const language of ['eng','spa'])for(const book of ['MRK','LUK']){
  const selected=packs.filter(p=>p.language===language&&p.book===book);
  groups[`${language}.${book}`]={packs:selected.length,discoveryRows:selected.reduce((n,p)=>n+p.discovery.rows,0),
   currentDiscoveryPacks:selected.filter(p=>p.discovery.currentRevisionRows>0).length,
   admittedGuidePacks:selected.filter(p=>p.guide.admittedSelectedUnits>0).length,
   admittedSelectedGuideUnits:selected.reduce((n,p)=>n+p.guide.admittedSelectedUnits,0),
   localNonemptyGuideUnits:selected.reduce((n,p)=>n+p.guide.localNonemptyUnits,0),
   scriptureAssets:selected.reduce((n,p)=>n+p.scripture.assets.length,0),
   passageRecordingDeclarations:selected.reduce((n,p)=>n+p.scripture.assets.filter(a=>a.passageRecordingDeclared).length,0),
   localScripturePayloads:selected.reduce((n,p)=>n+p.scripture.assets.filter(a=>a.localNonempty).length,0)};
 }
 return {schema:'fia-recording-source-coverage@1',limits:['No network requests or R2 queries performed.','Metadata URLs are discovery, not license, acquisition, acceptance or production playback.','Admission matches exact pack revision and selected unit identity; it does not prove current storage availability.','Local source bytes are not audible or device acceptance.','Scripture capability is metadata; exact passage declarations and local bytes are reported separately.'],groups,packs};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(auditRecordingCoverage(path.resolve(process.argv[2]||'.')),null,2)+'\n');
