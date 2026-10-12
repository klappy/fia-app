import {Buffer} from 'node:buffer';
import {verifyScriptureRangeOnly} from '../../../scripts/scripture-audio-publication.mjs';
import {validateDelivery} from '../../../apps/web/src/lib/media-delivery.js';
import {canonicalJSONString,sha256} from './contract.mjs';
const enc=x=>new TextEncoder().encode(canonicalJSONString(x));
const need=(x,r)=>{if(!x)throw Error(r);};
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
// Bounds asynchronous custody waits; synchronous verification remains subject to host CPU limits.
function validationDeadline(){const end=Date.now()+15000;let expired=false;const check=()=>{need(!expired&&Date.now()<end,'approved-audio-timeout');};const wait=async run=>{check();let timer;try{const value=await Promise.race([Promise.resolve().then(()=>{check();return run();}),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('approved-audio-timeout'));},Math.max(0,end-Date.now()));})]);check();return value;}finally{clearTimeout(timer);}};return {check,wait};}
export const APPROVED_AUDIO_LIMITS=Object.freeze({json:1048576,dependencies:64,total:8388608,media:16777216});
export function validateApprovedDependencies(deps){need(Array.isArray(deps)&&deps.length>0&&deps.length<=64,'approved-audio-dependencies');let total=0,last='';const paths=new Set();for(const d of deps){need(d&&Object.keys(d).sort().join(',')==='bytes,id,mime,path,sha256'&&typeof d.id==='string'&&d.id>last&&d.id.length<=2048&&typeof d.path==='string'&&/^\/content\/[A-Za-z0-9._/-]+\.json$/.test(d.path)&&!d.path.includes('..')&&!paths.has(d.path)&&/^[a-f0-9]{64}$/.test(d.sha256)&&d.mime==='application/json'&&Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=1048576,'approved-audio-dependency');last=d.id;paths.add(d.path);total+=d.bytes;}need(total<=8388608,'approved-audio-proof-size');}
export function deriveApprovedBinding({packId,baseRevision,sourceRevision,baseBytes,deliveryBytes,ledgerBytes,dependencies,readEvidence,assetId}){
 validateApprovedDependencies(dependencies);const pack=JSON.parse(new TextDecoder().decode(baseBytes)),delivery=JSON.parse(new TextDecoder().decode(deliveryBytes)),ledger=JSON.parse(new TextDecoder().decode(ledgerBytes));
 need(pack.id===packId&&delivery.packId===packId&&delivery.presentationRevision===baseRevision,'approved-audio-identity');
 need(dependencies.find(d=>d.id==='ledger')?.sha256===delivery.scriptureSourceLedger?.sha256&&dependencies.find(d=>d.id==='ledger')?.bytes===delivery.scriptureSourceLedger?.bytes,'approved-audio-ledger');
 validateDelivery(delivery,{packId,presentationRevision:baseRevision});
 const entries=delivery.entries.filter(e=>e.scriptureRangeOnly?.assetId===assetId);need(entries.length===1,'approved-audio-entry');const entry=entries[0];
 verifyScriptureRangeOnly({entry,ledger,pack,descriptor:{id:packId,revision:baseRevision},readEvidence});
 const d=entry.delivery;need(['audio/mpeg','audio/ogg'].includes(d.mime)&&Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=16777216,'approved-audio-media');
 const deliveryRevision=dependencies.find(d=>d.id==='delivery')?.sha256;need(deliveryRevision,'approved-audio-delivery');
 return {schema:'fia-approved-audio-binding@1',recipeRevision:'fia-approved-audio-retention@1',packId,baseRevision,sourceRevision,assetId,assetKind:'scripture',deliveryRevision,dependencies,media:{sha256:d.sha256,bytes:d.bytes,mime:d.mime,extension:d.mime==='audio/ogg'?'ogg':'mp3'},playbackRange:entry.playbackRange};
}
export async function expectedApprovedAudioArtifact(binding){const bindingSHA=await sha256(enc(binding));return {schema:'fia-bound-narration-audio@1',id:`approved-audio:${bindingSHA}`,delivery:{url:`/v1/approved-audio/${bindingSHA}/${binding.media.sha256}.${binding.media.extension}`,sha256:binding.media.sha256,bytes:binding.media.bytes,mime:binding.media.mime},playbackRange:binding.playbackRange};}
export function createApprovedAudioBindings({index,readDependency,readRetained,eligible}){
 need(index?.schema==='fia-approved-audio-proof-index@1'&&Array.isArray(index.bindings)&&typeof readDependency==='function'&&typeof readRetained==='function'&&typeof eligible==='function','approved-audio-ports');
 need(enc(index).length<=1048576,'approved-audio-index-size');const trusted=structuredClone(index);
 async function validateWithDeadline(binding,deadline){const {wait,check}=deadline;try{check();need(trusted.bindings.some(b=>same(b,binding))&&await wait(()=>eligible(binding))===true,'approved-audio-authority');validateApprovedDependencies(binding.dependencies);const raw=new Map();for(const d of binding.dependencies){const b=await wait(()=>readDependency(d));need(b instanceof Uint8Array&&b.length===d.bytes&&await sha256(b)===d.sha256,'approved-audio-integrity');check();raw.set(d.id,b);}need(binding.dependencies.find(d=>d.id==='base')?.sha256===binding.baseRevision,'approved-audio-base');
 check();const derived=deriveApprovedBinding({...binding,baseBytes:raw.get('base'),deliveryBytes:raw.get('delivery'),ledgerBytes:raw.get('ledger'),readEvidence:h=>{const b=raw.get(`evidence:${h}`);need(b,'approved-audio-evidence');return Buffer.from(b);}});check();return same(binding,derived)&&await wait(()=>eligible(binding))===true;
 }catch{return false;}}
 async function validateBinding(binding){return validateWithDeadline(binding,validationDeadline());}
 async function resolve(context){const deadline=validationDeadline(),{wait,check}=deadline;const packId=context.packId??context.basePresentation?.id,result={narrationBindings:{},boundArtifacts:[],bindings:[]};for(const binding of trusted.bindings.filter(b=>b.packId===packId&&b.baseRevision===context.baseRevision&&b.sourceRevision===context.sourceRevision)){
 const activities=context.basePresentation.activities.filter(a=>a.kind===binding.assetKind&&a.assetId===binding.assetId);if(!activities.length)continue;
 let reason='approved-audio-invalid',ready=await validateWithDeadline(binding,deadline);if(ready){try{const original=await wait(()=>readDependency(binding.dependencies.find(d=>d.id==='base')));const descriptor=binding.dependencies.find(d=>d.id==='base');need(original instanceof Uint8Array&&original.length===descriptor.bytes&&await sha256(original)===descriptor.sha256,'approved-audio-base-reread');const pack=JSON.parse(new TextDecoder().decode(original));ready=activities.every(a=>pack.activities.some(b=>b.id===a.id&&b.kind===a.kind&&b.assetId===a.assetId))&&same(pack.assets[binding.assetId],context.basePresentation.assets[binding.assetId]);}catch{ready=false;}}if(ready){let bytes;try{bytes=await wait(()=>readRetained(binding.media));}catch{bytes=new Uint8Array();}if(bytes==null){ready=false;reason='approved-audio-not-retained';}else ready=bytes instanceof Uint8Array&&bytes.length===binding.media.bytes&&await sha256(bytes)===binding.media.sha256;}
 if(ready){try{ready=await wait(()=>eligible(binding))===true;}catch{ready=false;}}
 if(!ready){for(const a of activities)result.narrationBindings[a.id]={action:'blocked',status:'unavailable',reason};continue;}
 const artifact=await wait(()=>expectedApprovedAudioArtifact(binding)),bytes=enc(artifact),digest=await wait(()=>sha256(bytes));check();result.boundArtifacts.push({id:artifact.id,bytes,sha256:digest});result.bindings.push(binding);for(const a of activities)result.narrationBindings[a.id]={action:'play-bound-audio',artifact:{id:artifact.id,sha256:digest}};
 }return result;}
 return {resolve,validateBinding,expectedArtifact:expectedApprovedAudioArtifact};
}
