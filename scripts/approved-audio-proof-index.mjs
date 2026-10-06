import {readFile,readdir,realpath} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyScriptureRangeOnly} from './scripture-audio-publication.mjs';
import {deriveApprovedBinding} from '../server/fia/preparation/approved-audio-bindings.mjs';
import {canonicalJSONString} from '../server/fia/preparation/contract.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),need=(x,r)=>{if(!x)throw Error(r);};
export async function buildApprovedAudioProofIndex({publicRoot,authority}){
 const root=await realpath(publicRoot),registryBytes=await readFile(resolve(root,'content/registry.json'));need(authority?.registrySha256===hash(registryBytes),'approved-audio-registry-authority');const registry=JSON.parse(registryBytes);need(registry.sourceRevision===authority.sourceRevision,'approved-audio-source-authority');const bindings=[];
 for(const row of registry.packs){const dir=resolve(root,'content/delivery',row.id);let names;try{names=(await readdir(dir)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));}catch(e){if(e.code==='ENOENT')continue;throw e;}need(names.length<=1,'approved-audio-ambiguous-delivery');if(!names.length)continue;
 const deps=new Map(),raw=new Map();
 const read=(id,path,expected)=>{need(typeof path==='string'&&path.startsWith('/content/')&&!path.includes('..'),'approved-audio-path');const disk=resolve(root,'.'+path);need(disk.startsWith(root+sep),'approved-audio-path');const b=readFileSync(disk);need(b.length>0&&b.length<=1048576&&(!expected||hash(b)===expected),'approved-audio-proof-integrity');JSON.parse(b);deps.set(id,{id,path,sha256:hash(b),bytes:b.length,mime:'application/json'});raw.set(id,b);return b;};
 const deliveryBytes=read('delivery',`/content/delivery/${row.id}/${names[0]}`,names[0].slice(0,-5)),delivery=JSON.parse(deliveryBytes);if(!delivery.entries?.some(e=>e.scriptureRangeOnly))continue;
 const baseBytes=read('base',row.presentation.url,row.presentation.sha256);need(baseBytes.length===row.presentation.bytes&&row.revision===hash(baseBytes),'approved-audio-base');const pack=JSON.parse(baseBytes),ledgerBytes=read('ledger',delivery.scriptureSourceLedger.url,delivery.scriptureSourceLedger.sha256);need(ledgerBytes.length===delivery.scriptureSourceLedger.bytes,'approved-audio-ledger-size');const ledger=JSON.parse(ledgerBytes),readEvidence=h=>read(`evidence:${h}`,`/content/scripture-evidence/${h}.json`,h);
 for(const entry of delivery.entries.filter(e=>e.scriptureRangeOnly)){verifyScriptureRangeOnly({entry,ledger,pack,descriptor:{id:row.id,revision:row.revision},readEvidence});const dependencies=[...deps.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);bindings.push(deriveApprovedBinding({packId:row.id,baseRevision:row.revision,sourceRevision:registry.sourceRevision,baseBytes,deliveryBytes,ledgerBytes,dependencies,readEvidence:h=>raw.get(`evidence:${h}`),assetId:entry.scriptureRangeOnly.assetId}));}
 }
 bindings.sort((a,b)=>`${a.packId}/${a.assetId}`.localeCompare(`${b.packId}/${b.assetId}`));const index={schema:'fia-approved-audio-proof-index@1',authority,bindings},bytes=new TextEncoder().encode(canonicalJSONString(index));need(bytes.length<=1048576,'approved-audio-index-size');const digest=hash(bytes);return {bytes,descriptor:{id:'approved-audio-proof-index',path:`/content/approved-audio/${digest}.json`,sha256:digest,bytes:bytes.length,mime:'application/json'},index};
}
