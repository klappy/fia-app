import {canonicalJSONString,sha256} from '../contract.mjs';
import {PILOT_SOURCE_SHA256} from './artifact.mjs';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const image=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(x);
function shape(x,keys){if(!x||Object.getPrototypeOf(x)!==Object.prototype||Object.keys(x).length!==keys.length||keys.some(k=>!Object.hasOwn(x,k)))throw Error('activation-shape');}
function parse(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>16384)throw Error('activation-size');return JSON.parse(text);}
// Only trusted deployment configuration may supply these values. Hashes bind
// reviewed receipts; a syntactically valid receipt does not establish its truth.
// No public request field is accepted and the checked-in configuration is disabled.
export async function loadActivation(env){
 const a=parse(env.FIA_ASR_ACTIVATION);
 if(a?.enabled!==true)throw Error('activation-disabled');
 shape(a,['schema','enabled','startedAt','expiresAt','identity','image','enforcementSha256','reviewSha256']);
 if(a.schema!=='fia-asr-activation@1'||!Number.isSafeInteger(a.startedAt)||a.startedAt<0||a.expiresAt!==a.startedAt+1200000||!image(a.image)||!hash(a.enforcementSha256)||!hash(a.reviewSha256))throw Error('activation-pins');
 const i=a.identity;
 shape(i,['sourceSha256','sourceBytes','modelId','modelRevision','language','runtimeSha256','configSha256','modelSha256','scriptSha256']);
 if(i.sourceSha256!==PILOT_SOURCE_SHA256||i.sourceBytes!==867865||i.modelId!=='Systran/faster-whisper-small'||i.modelRevision!=='536b0662742c02347bc0e980a01041f333bce120'||i.language!=='eng'||!['runtimeSha256','configSha256','modelSha256','scriptSha256'].every(k=>hash(i[k])))throw Error('activation-identity');
 const e=parse(env.FIA_ASR_ENFORCEMENT);
 shape(e,['schema','image','schedulingPolicy','processMemoryBytes','scratchBytes','nonroot','modelReadOnly','offline','watchdogSeconds','proofSha256']);
 if(e.schema!=='fia-asr-hosted-enforcement@1'||e.image!==a.image||e.schedulingPolicy!=='default'||e.processMemoryBytes!==4294967296||e.scratchBytes!==268435456||e.nonroot!==true||e.modelReadOnly!==true||e.offline!==true||e.watchdogSeconds!==390||!hash(e.proofSha256)||await sha256(canonicalJSONString(e))!==a.enforcementSha256)throw Error('hosted-enforcement-unqualified');
 return structuredClone({enabled:true,identity:i,activation:{startedAt:a.startedAt,expiresAt:a.expiresAt},image:a.image,enforcement:e,enforcementSha256:a.enforcementSha256,reviewSha256:a.reviewSha256});
}
