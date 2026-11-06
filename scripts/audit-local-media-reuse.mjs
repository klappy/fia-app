#!/usr/bin/env node
// Read-only byte inventory. Candidate joins never constitute acquisition or playback admission.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const digest=b=>createHash('sha256').update(b).digest('hex');
const ARCHIVES=[['source-packs.json.gz','48f8c768b108f2b9977048db26fa54c82af4eea7f54c66fa650ef84f7d61ecd7'],['source-packs-luk.json.gz','98537437857e748d48ce8ad639c95a6b9a8b61b315594ffc1b94328fc0df0283']];
const canonical=r=>{
 if(!r||typeof r.url!=='string'||!r.url.startsWith('https://')||typeof r.sourceFile!=='string'||!r.sourceFile||!/^[a-f0-9]{64}$/.test(r.sourceFileSha256)||!/^[a-f0-9]{40}$/.test(r.titleProvenance?.revision))throw Error('reuse-canonical-source-identity:'+r?.id+':'+JSON.stringify(r?.titleProvenance));
 return {url:r.url,sourceFile:r.sourceFile,sourceFileSha256:r.sourceFileSha256,revision:r.titleProvenance.revision};
};
export function auditLocalMediaReuse({root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),readBytes=path=>readFileSync(resolve(root,path))}={}){
 const json=path=>JSON.parse(readBytes(path));
 const bindings=json('server/fia/compiler/presentation/source-bindings.json'),packs={};
 const archives=ARCHIVES.map(([name,pin])=>{const bytes=readBytes('server/fia/compiler/presentation/'+name);if(digest(bytes)!==pin)throw Error('reuse-archive-pin');const source=JSON.parse(gunzipSync(bytes));for(const[id,pack]of Object.entries(source.packs)){if(packs[id]||digest(JSON.stringify(pack.resources))!==bindings[id]?.resources)throw Error('reuse-resource-binding');packs[id]=pack;}return {path:name,sha256:pin,sourceRevision:source.revision};});
 if(archives[0].sourceRevision!==archives[1].sourceRevision)throw Error('reuse-source-revision');
 const allowBytes=readBytes('tests/release/runtime-allowlist.json'),allow=JSON.parse(allowBytes),approved=json('server/fia/publication/approved-presentation.json'),provenance=json('apps/web/public/assets/provenance.json');
 const registry=json('apps/web/public/content/registry.json');const dimensions=['eng.MRK','spa.MRK','eng.LUK','spa.LUK'];
 const coverage=dimensions.map(group=>({group,expectedPacks:group.endsWith('MRK')?68:97,observedPacks:registry.packs.filter(p=>p.id.startsWith(group+'-')).length,candidateBindings:{image:0,map:0,video:0},candidatePacks:[],newAdmissions:0}));
 if(registry.packs.length!==330||new Set(registry.packs.map(p=>p.id)).size!==330||coverage.some(c=>c.expectedPacks!==c.observedPacks))throw Error('reuse-corpus-denominator');
 const approvedDescriptor=registry.packs.find(p=>p.id==='eng.MRK-1-1-13');
 if(digest(readBytes('server/fia/publication/approved-presentation.json'))!==approvedDescriptor?.revision)throw Error('reuse-approved-publication-pin');
 const ledger=json('apps/web/public/content/video-sources/0c6b18ce07914c6e61f8827a536836c0d0bfbcfb198f876d38aaa4f041d1836d.json');
 const assets=[];
 for(const file of allow.files.filter(f=>f.group==='pack-media')){
  const asset=Object.values(approved.assets).find(a=>a.src==='/'+file.path);if(!asset||!['image','map','video'].includes(asset.kind))continue;
  const bytes=readBytes('apps/web/public/'+file.path);if(digest(bytes)!==file.sha256)throw Error('reuse-local-byte-pin');
  const collection={image:'images',map:'maps',video:'videos'}[asset.kind];
  const raw=packs['eng.MRK-1-1-13'].resources[collection].find(r=>r.id===asset.id);const sourceIdentity=canonical(raw),identity=JSON.stringify(sourceIdentity),candidates=[];
  for(const descriptor of registry.packs){const resources=packs[descriptor.id]?.resources[collection];if(!resources)throw Error('reuse-missing-source-pack');if(resources.some(r=>r.url===sourceIdentity.url&&/^[a-f0-9]{40}$/.test(r.titleProvenance?.revision)&&JSON.stringify(canonical(r))===identity))candidates.push(descriptor.id);}
  const standalone=provenance[asset.id],video=ledger.entries.find(r=>r.path===asset.src&&r.assetId===asset.id&&r.bundled.sha256===file.sha256&&r.bundled.bytes===bytes.length);
  for(const c of coverage){const matches=candidates.filter(id=>id.startsWith(c.group+'-'));c.candidateBindings[asset.kind]+=matches.length;c.candidatePacks.push(...matches);}
  assets.push({assetId:asset.id,kind:asset.kind,path:asset.src,sha256:file.sha256,bytes:bytes.length,byteStatus:'matches-reviewed-runtime-allowlist',sourceIdentity,candidatePackIds:candidates,
   provenance:{bundledPublication:'eng.MRK-1-1-13',standaloneMetadata:standalone?{source:standalone.source,rights:standalone.rights,mediaUrl:standalone.mediaUrl}:null,videoReplacementLedger:video?{id:video.id,bundled:video.bundled,published:video.published,metadata:video.metadata,rights:video.rights,review:video.review}:null},
   admission:'candidate-only-no-new-admission'});
 }
 for(const c of coverage){c.candidatePacks=[...new Set(c.candidatePacks)].sort();c.candidatePackCount=c.candidatePacks.length;}
 return {schema:'fia-local-media-reuse-audit@1',scope:'verified bundled bytes and exact canonical metadata joins; no new publisher custody, playback admission or acquisition',inputs:{runtimeAllowlistSha256:digest(allowBytes),approvedPublicationSha256:approvedDescriptor.revision,sourceBindingsSha256:digest(readBytes('server/fia/compiler/presentation/source-bindings.json')),archives},totalVerifiedBytes:assets.reduce((n,a)=>n+a.bytes,0),assets,coverage,newAdmissions:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.stdout.write(JSON.stringify(auditLocalMediaReuse(),null,2)+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}}
