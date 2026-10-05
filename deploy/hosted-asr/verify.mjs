import {readFile,lstat,realpath,readdir} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const digest=b=>createHash('sha256').update(b).digest('hex');
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const image=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(x);
const fail=message=>{throw Error(message);};
const proposal=JSON.parse(await readFile(new URL('./proposal.json',import.meta.url),'utf8'));
export async function verifyFile(root,entry){
 entry=structuredClone(entry);
 if(!entry||typeof entry.path!=='string'||!entry.path||entry.path.includes('\\')||entry.path.split('/').some(p=>!p||p==='.'||p==='..')||entry.path.startsWith('/')||!hash(entry.sha256)||!Number.isSafeInteger(entry.bytes)||entry.bytes<1)fail('invalid-file-lock');
 const base=await realpath(root),path=resolve(base,entry.path),rel=relative(base,path);if(rel.startsWith('..'+sep)||rel==='..')fail('file-outside-root');
 let current=base;for(const part of entry.path.split('/')){current=resolve(current,part);if((await lstat(current)).isSymbolicLink())fail('symlink-not-allowed');}
 const stat=await lstat(path);if(!stat.isFile()||stat.size!==entry.bytes)fail('file-size-mismatch');
 // Stream large retained weights; no whole-model memory allocation.
 const {createReadStream}=await import('node:fs');const h=createHash('sha256');let bytes=0;for await(const chunk of createReadStream(path)){bytes+=chunk.length;if(bytes>entry.bytes)fail('file-size-mismatch');h.update(chunk);}if(bytes!==entry.bytes||h.digest('hex')!==entry.sha256)fail('file-hash-mismatch');return {path:entry.path,bytes,sha256:entry.sha256};
}

export async function verifyInputs(directory){
 const lock=JSON.parse(await readFile(new URL('./inputs.lock.json',import.meta.url),'utf8'));
 if(lock.model!==proposal.model.name||lock.revision!==proposal.model.revision)fail('model-identity-mismatch');
 for(const f of proposal.model.files)await verifyFile(directory,{...f,path:'model/'+f.path});
 for(const f of lock.wheels)await verifyFile(directory,f);
 return {status:'acquired-byte-verified-not-runtime-qualified',modelRevision:lock.revision,modelBytes:proposal.model.files.reduce((n,f)=>n+f.bytes,0),wheelCount:lock.wheels.length,blockers:lock.blockers};
}
export async function verifyBundle({directory,lock}){
 lock=structuredClone(lock);if(lock?.schema!=='fia-hosted-asr-lock@1'||lock.platform!=='linux/amd64')fail('invalid-runtime-lock');
 if(!image(lock.baseImage)||!image(lock.finalImage))fail('missing-immutable-image-digests');
 if(typeof lock.pythonVersion!=='string'||!/^3\.\d+\.\d+$/.test(lock.pythonVersion)||typeof lock.containerDependencyVersion!=='string'||!/^\d+\.\d+\.\d+$/.test(lock.containerDependencyVersion))fail('missing-runtime-versions');
 if(!Array.isArray(lock.wheels)||!lock.wheels.length)fail('missing-wheel-locks');
 if(!hash(lock.runtimeLockReview))fail('missing-independent-lock-review');
 const names=await readdir(resolve(directory,'model'));if(names.slice().sort().join()!==proposal.model.files.map(f=>f.path).sort().join())fail('model-file-set-mismatch');
 const model=[];for(const f of proposal.model.files)model.push(await verifyFile(directory,{...f,path:'model/'+f.path}));
 const entries=[lock.runtimeManifest,lock.recognizer,lock.notices,lock.limitsReceipt,lock.worker,...lock.wheels];const paths=new Set();for(const e of entries){if(paths.has(e?.path))fail('duplicate-runtime-file');paths.add(e?.path);await verifyFile(directory,e);}
 if(lock.wheels.some(w=>!w.path.endsWith('.whl')))fail('invalid-wheel-file');
 const manifest=JSON.parse(await readFile(resolve(directory,lock.runtimeManifest.path),'utf8'));
 if(manifest.platform!==lock.platform||manifest.pythonVersion!==lock.pythonVersion||manifest.containerDependencyVersion!==lock.containerDependencyVersion||JSON.stringify(manifest.wheels)!==JSON.stringify(lock.wheels))fail('runtime-manifest-mismatch');
 const limits=JSON.parse(await readFile(resolve(directory,lock.limitsReceipt.path),'utf8'));
 if(limits.schema!=='fia-asr-image-limits@1'||limits.image!==lock.finalImage||limits.memoryEnforced!==true||limits.scratchEnforced!==true||limits.nonroot!==true||limits.offline!==true||limits.modelReadOnly!==true||limits.processMemoryBytes!==proposal.limits.processMemoryBytes||limits.scratchBytes!==proposal.limits.scratchBytes)fail('image-limits-unqualified');
 return {schema:'fia-asr-local-lock-verification@1',status:'local-files-verified-not-deployment-authority',modelManifestSha256:digest(JSON.stringify(model)),runtimeManifestSha256:lock.runtimeManifest.sha256,recognizerSha256:lock.recognizer.sha256,image:lock.finalImage,independentReviewReceiptSha256:lock.runtimeLockReview};
}
export async function proposedDevConfig(args){const receipt=await verifyBundle(args);return {status:'proposed-requires-independent-review-and-activation',receipt,config:{name:proposal.application,main:resolve(args.directory,args.lock.worker.path),compatibility_date:'2026-09-01',workers_dev:false,preview_urls:false,containers:[{class_name:proposal.className,image:receipt.image,max_instances:1,instance_type:proposal.instanceType}],durable_objects:{bindings:[{name:proposal.binding,class_name:proposal.className}]},migrations:[{tag:'v1-asr-development',new_sqlite_classes:[proposal.className]}]}};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const [directory,lockPath]=process.argv.slice(2);if(!directory||!lockPath)fail('usage: node verify.mjs DIRECTORY LOCK_JSON');console.log(JSON.stringify(await verifyBundle({directory,lock:JSON.parse(await readFile(lockPath,'utf8'))}),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
