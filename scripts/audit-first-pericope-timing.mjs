/** Committed first-pericope runtime predicate audit; no media fetch, decoding or acoustic acceptance. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateTranscript,activityWords} from '../apps/web/src/lib/transcript.js';
import {activityAlignment} from '../apps/web/src/lib/alignment.js';
import {tailExtendedRange} from '../apps/web/src/lib/range-tail.js';
import {validateDelivery,deliveryVariant} from '../apps/web/src/lib/media-delivery.js';
import {verifyRecordedGuideReplacement} from './recorded-guide-publication.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const FIRST_PACK='eng.MRK-1-1-13';
export function evaluateFirstGuideTiming({text,activityId,transcript,range,audioSha256,sourceAudioSha256,mapping,playback='ranged'}){
 const untimed=(reason,extra={})=>({accepted:false,status:'untimed',reason,...extra});
 if(playback==='whole-file-native-ended')return untimed('whole-file-native-ended-is-not-word-qualified',{schemaValid:null});
 if(!transcript)return untimed('missing-sidecar',{schemaValid:false});
 try{validateTranscript(transcript);}catch(error){return untimed('invalid-transcript-schema',{schemaValid:false,error:error.message});}
 const common={schemaValid:true};
 if(transcript.audioSha256!==audioSha256||transcript.sourceAudioSha256!==sourceAudioSha256)return untimed('sidecar-recording-or-source-identity',common);
 if(JSON.stringify(transcript.timingMapping)!==JSON.stringify(mapping))return untimed('sidecar-clock-mapping-identity',common);
 const a=transcript.activities?.[activityId];
 if(!a)return untimed('missing-activity-map',common);
 const words=activityWords(a,range);
 if(!words){
  const count=Array.isArray(a.words)?a.words.length:0;
  if(!Number.isInteger(a.total)||a.total!==count||!Number.isInteger(a.matched)||a.matched>a.total||a.matched<Math.ceil(a.total*.7))return untimed('insufficient-asr-match',{...common,matched:a.matched??null,total:a.total??null});
  const outside=range&&(range.startSeconds*1000>a.startMs||range.endSeconds*1000<a.endMs||a.words.some(w=>w.startMs<range.startSeconds*1000||w.endMs>range.endSeconds*1000));
  return untimed(outside?'outside-playback-range':'invalid-activity-word-times',common);
 }
 const alignment=activityAlignment(text,words,a.endMs);
 if(!alignment)return untimed('displayed-text-token-or-offset-mismatch',common);
 return {accepted:true,status:'runtime-predicate-accepted',reason:null,...common,words:words.length,matched:a.matched,total:a.total,clockDomain:alignment.clockDomain};
}
export function auditFirstPericopeTiming(root){
 const base=path.resolve(root,'apps/web/public');
 const local=url=>{if(typeof url!=='string'||!url.startsWith('/')||url.startsWith('//'))throw Error('Not a local source path');const f=path.resolve(base,'.'+url);if(!f.startsWith(base+path.sep))throw Error('Source path escapes public');return f;};
 const read=url=>fs.readFileSync(local(url));
 const registryBytes=read('/content/registry.json'),registry=JSON.parse(registryBytes),descriptor=registry.packs.find(p=>p.id===FIRST_PACK);
 if(!descriptor)throw Error('First approved presentation descriptor is missing');
 const packBytes=read(descriptor.presentation.url);
 if(hash(packBytes)!==descriptor.revision||hash(packBytes)!==descriptor.presentation.sha256||packBytes.length!==descriptor.presentation.bytes)throw Error('First presentation content identity changed');
 const approvedBytes=fs.readFileSync(path.resolve(root,'apps/web/src/lib/pack.json'));
 if(!packBytes.equals(approvedBytes))throw Error('Approved bundled presentation and published first pack differ');
 const pack=JSON.parse(packBytes),dir=local('/content/delivery/'+FIRST_PACK),names=fs.readdirSync(dir).filter(n=>n.endsWith('.json'));
 if(names.length!==1)throw Error('First delivery is missing or ambiguous');
 const deliveryBytes=fs.readFileSync(path.join(dir,names[0]));
 if(names[0]!==hash(deliveryBytes)+'.json')throw Error('Delivery filename/content identity mismatch');
 const delivery=validateDelivery(JSON.parse(deliveryBytes),{packId:FIRST_PACK,presentationRevision:descriptor.revision});
 const ledgers=new Map();
 for(const ref of [delivery.recordingLedger,...(delivery.recordingLedgers||[])]){
  if(!ref)throw Error('Recorded-guide source ledger is missing');const bytes=read(ref.url);
  if(hash(bytes)!==ref.sha256||bytes.length!==ref.bytes)throw Error('Recorded-guide source ledger content mismatch');
  ledgers.set(ref.sha256,JSON.parse(bytes));
 }
 const evidence=new Map();const readEvidence=sha=>{if(!evidence.has(sha))evidence.set(sha,read('/content/recording-evidence/'+sha+'.json'));return evidence.get(sha);};
 const normalize=e=>({path:e.path,sourceSha256:e.source?.sha256,deliveryURL:e.delivery?.url,logicalSourceSha256:e.audioReplacement?.logicalSource?.sha256,duration:e.delivery?.duration,playbackRange:e.playbackRange,timing:e.timing,scriptureAlignment:e.scriptureAlignment,scripturePlaybackMode:e.scripturePlaybackMode});
 const approvedIds=new Set([...ledgers.values()].flatMap(l=>l.mappings.map(m=>m.activityId)));
 const originalNativeMp3Routes=[...ledgers.entries()].map(([ledgerSha,l])=>({sourceLedgerSha256:ledgerSha,audioSha256:l.recording.sha256,matchingRepositorySidecar:fs.existsSync(local('/transcripts/'+l.recording.sha256+'.words.json')),wordTimingQualified:false,reason:'Canonical OGG sidecars bind a different delivery SHA. Decoded-PCM source mapping does not qualify the native MP3 media clock.'}));
 const firstGuide=delivery.entries.find(e=>e.audioReplacement),firstMappingEvidenceSha256=firstGuide.timing.mappingEvidenceSha256,firstMappingEvidence=JSON.parse(readEvidence(firstMappingEvidenceSha256));
 const routingScope={classification:'static-canonical-OGG-delivery-predicates-only',executedOriginalNativeMp3PlaybackPasses:0,originalNativeMp3Routes,firstMappingEvidence:{sha256:firstMappingEvidenceSha256,sourceAudioSha256:firstMappingEvidence.sourceAudioSha256,deliveryAudioSha256:firstMappingEvidence.deliveryAudioSha256,sourceClockDomain:firstMappingEvidence.sourceClockDomain,method:firstMappingEvidence.method},wholeFileNativeEnded:{wordTimingQualified:false,reason:'Qualified whole-file playback does not qualify word timings or permit reuse of another audio clock.'},resourceDescriptionsAndTerms:{audited:false,reason:'These111 guide/discussion timing maps do not establish resource-description or term alignment.'}};
 const authored=pack.activities.filter(a=>['guide','discussion'].includes(a.kind)&&a.sourceUnitId);
 if([...approvedIds].some(id=>!authored.some(a=>a.id===id)))throw Error('An accepted original guide route disappeared from the approved presentation');
 const excludedDerivedResourceRoutes=authored.filter(a=>!approvedIds.has(a.id)).map(a=>a.id);
 const rows=[];
 for(const a of authored.filter(a=>approvedIds.has(a.id))){
  const shown=a.readingGroupId?a.sourceText:a.narration,entry=delivery.entries.find(e=>e.path===a.audioSrc),common={activityId:a.id,kind:a.kind,screenId:a.readingGroupId||a.id,shownTextField:a.readingGroupId?'sourceText':'narration',shownTextSha256:hash(shown||''),sourceTextSha256:hash(a.sourceText||'')};
  if(!entry){rows.push({...common,accepted:false,status:'untimed',reason:'missing-recording-descriptor',variants:[]});continue;}
  const ledgerSha=entry.audioReplacement?.recordingLedgerSha256||delivery.recordingLedger.sha256,ledger=ledgers.get(ledgerSha);
  if(!ledger)throw Error('Selected recording source ledger missing: '+a.id);
  const logical=read(entry.path),file={path:entry.path,group:'audio',sha256:hash(logical),bytes:logical.length};
  const variants=[];
  for(const quality of Object.keys(entry.variants||{})){
   const v=deliveryVariant(entry,quality);
   // Includes accepted source/text/logical identity, source-to-delivery range,
   // measured mapping and all hash-bound range/rights/review evidence.
   verifyRecordedGuideReplacement({entry:v,ledger,pack,descriptor,file,readEvidence});
   const current=normalize(v),all=delivery.entries.map(e=>normalize(e.variants?.[quality]?deliveryVariant(e,quality):e));
   const range=tailExtendedRange(v.playbackRange,current,all),url='/transcripts/'+v.delivery.sha256+'.words.json';
   const transcriptBytes=fs.existsSync(local(url))?read(url):null,transcript=transcriptBytes?JSON.parse(transcriptBytes):null;
   const outcome=evaluateFirstGuideTiming({text:shown,activityId:a.id,transcript,range,audioSha256:v.delivery.sha256,sourceAudioSha256:v.source.sha256,mapping:v.timing.mapping});
   variants.push({quality,audioSha256:v.delivery.sha256,sourceAudioSha256:v.source.sha256,sourceLedgerSha256:ledgerSha,sidecarSha256:transcriptBytes?hash(transcriptBytes):null,baseRange:v.playbackRange,runtimeRange:range,sourceBindingVerified:true,...outcome});
  }
  const selected=variants.find(v=>v.quality===entry.defaultSize);
  if(!selected)throw Error('Default guide delivery variant missing: '+a.id);
  rows.push({...common,selectedQuality:selected.quality,accepted:selected.accepted,status:selected.status,reason:selected.reason,variants});
 }
 const byReason=rows.reduce((out,r)=>(out[r.reason||'runtime-predicate-accepted']=(out[r.reason||'runtime-predicate-accepted']||0)+1,out),{});
 return {schema:'fia-first-pericope-timing-quality@1',packId:FIRST_PACK,presentationSha256:descriptor.revision,approvedPresentationSha256:hash(approvedBytes),registrySha256:hash(registryBytes),deliverySha256:hash(deliveryBytes),guideRoutes:rows.length,accepted:rows.filter(r=>r.accepted).length,untimed:rows.filter(r=>!r.accepted).length,byReason,routingScope,excludedDerivedResourceRoutes,rows,scope:'The111 source-ledger-bound guide/discussion routes, evaluated against canonical delivered OGG descriptors and their delivery-media-seconds sidecars. The60 accepted predicates are NOT executable-original/native-MP3 playback or highlight passes. In particular the d631 mapping explicitly excludes the native MP3 clock. Native MP3 source words are not qualified by copying/renaming delivery sidecars. Derived resource subroutes are separate; whole-file native derivatives and term descriptions gain no word qualification here. No media fetch, native playback, acoustic accuracy, physical-device acceptance or current production storage query; repository sidecar absence does not establish publisher absence. Known untimed routes remain explicit; not an all111-pass claim.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.stdout.write(JSON.stringify(auditFirstPericopeTiming(path.resolve(process.argv[2]||'.')),null,2)+'\n');
