import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const MAX_BYTES=1048576;
export const CATALOG_ID='fia-mark-catalog';
export function generalizedRecords(registry,authority){
 const artifact=(sha256,bytes)=>({sha256,bytes,mime:'application/json',path:'/v1/artifacts/'+sha256});
 const source={compilerCommit:authority.compilerCommit,rawInventoryCommit:authority.sourceCommit,recipeCommit:authority.recipeCommit};
 return [{capability:'mark-presentation-catalog',catalogSchema:'fia.browser-registry@1',contentSchemaVersion:1,authority:source,status:'ready',packId:CATALOG_ID,revision:authority.catalog.sha256,artifact:artifact(authority.catalog.sha256,authority.catalog.bytes)},...registry.packs.map(d=>({capability:'mark-presentation-artifact',contentSchema:'fia.presentation@1',identity:{packId:d.id,language:d.language,pericopeId:d.pericopeId,title:d.title,defaultScriptureId:d.defaultScriptureId},authority:source,artifactSource:d.id==='eng.MRK-1-1-13'?authority.approvedLineage:{sourceCommit:authority.sourceCommit},capabilities:d.capabilities,diagnostics:d.diagnostics,media:{delivery:'manual-download-only',sourceReferencedIsPlayable:false},status:'ready',packId:d.id,revision:d.revision,artifact:artifact(d.presentation.sha256,d.presentation.bytes)}))];
}
export function buildGeneralizedSnapshot(root,authority){
 if(!['compilerCommit','sourceCommit','recipeCommit'].every(k=>/^[a-f0-9]{40}$/.test(authority[k]||'')))throw Error('invalid-generalized-authority');
 const load=(path,expected)=>{if(!/^\/content\/(?:registry\.json|packs\/(?:eng|spa)\.MRK-[0-9-]+\/[a-f0-9]{64}\.json)$/.test(path))throw Error('invalid-static-path');const bytes=readFileSync(resolve(root,'.'+path));if(bytes.length>MAX_BYTES||bytes.length!==expected.bytes||hash(bytes)!==expected.sha256||!Buffer.from(bytes.toString('utf8')).equals(bytes))throw Error('unaccepted-generalized-bytes');return JSON.parse(bytes);};
 const registry=load('/content/registry.json',authority.catalog);
 if(registry.schemaVersion!==1||!Array.isArray(registry.packs)||registry.packs.length!==136||new Set(registry.packs.map(d=>d.id)).size!==136||registry.packs.filter(d=>d.language==='eng').length!==68||registry.packs.filter(d=>d.language==='spa').length!==68)throw Error('invalid-generalized-catalog');
 const staticArtifacts=[{descriptor:{sha256:authority.catalog.sha256,bytes:authority.catalog.bytes,mime:'application/json',path:'/v1/artifacts/'+authority.catalog.sha256},staticPath:'/content/registry.json'}];
 for(const d of registry.packs){
  if(!/^(eng|spa)\.MRK-[0-9]+-[0-9]+(?:-[0-9]+){1,2}$/.test(d.id)||d.id.length>80||d.language!==d.id.slice(0,3)||d.revision!==d.presentation.sha256||d.presentation.url!==`/content/packs/${d.id}/${d.revision}.json`)throw Error('invalid-generalized-descriptor');
  const pack=load(d.presentation.url,d.presentation);
  if(pack.id!==d.id&&!(d.id==='eng.MRK-1-1-13'&&pack.id==='fia-mark-authentic@1'))throw Error('presentation-identity-mismatch');
  if(pack.assets?.[d.defaultScriptureId]?.kind!=='scripture'||!['activities','sections','examples','listContracts'].every(k=>Array.isArray(pack[k])))throw Error('invalid-generalized-shape');
  staticArtifacts.push({descriptor:{sha256:d.revision,bytes:d.presentation.bytes,mime:'application/json',path:'/v1/artifacts/'+d.revision},staticPath:d.presentation.url});
 }
 const records=generalizedRecords(registry,authority);
 if(authority.records.length!==records.length)throw Error('generalized-authority-count');
 for(let i=0;i<records.length;i++){const expected=authority.records[i],record=records[i];if(expected.packId!==record.packId||expected.revision!==record.revision||expected.envelopeSha256!==hash(JSON.stringify(record)))throw Error('unaccepted-generalized-record');}
 return {records,staticArtifacts,current:Object.fromEntries(records.map(r=>[r.packId,r.revision])),authority:{...authority,catalog:authority.catalog,records:undefined}};
}
