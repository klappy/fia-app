/** Refresh local release byte pins after an exact-HEAD build. Not review or publication. */
import{readFileSync,writeFileSync,readdirSync,statSync}from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';
import{verifyBuildParameters,normalizeGenerated}from'../tests/release/parameterized-closure.js';
const hash=b=>createHash('sha256').update(b).digest('hex'),file='tests/release/generalized-release-closure.json',closure=JSON.parse(readFileSync(file));
const parameters=verifyBuildParameters(pathToFileURL(process.cwd()+'/dist/'),closure.version);
const sources=execFileSync('git',['diff','--name-only','d7f17f461eec5a357752b056c9e074e77ea085a7'],{encoding:'utf8'}).trim().split('\n').filter(p=>p&&p!==file);
for(const path of sources){const bytes=readFileSync(path),old=closure.changedSources.find(f=>f.path===path);if(old){old.sha256=hash(bytes);if('bytes'in old)old.bytes=bytes.length;}else closure.changedSources.push({path,sha256:hash(bytes),bytes:bytes.length});}
const allow=new Set(JSON.parse(readFileSync('tests/release/runtime-allowlist.json')).files.map(f=>f.path));
const files=readdirSync('dist',{recursive:true}).filter(p=>statSync('dist/'+p).isFile()&&p!=='version.json'&&!allow.has(p));
const next=files.map(path=>{const bytes=Buffer.from(normalizeGenerated(path,readFileSync('dist/'+path),parameters));return{path,sha256:hash(bytes),bytes:bytes.length};}).sort((a,b)=>a.path.localeCompare(b.path));
const remaining=new Map(next.map(f=>[f.path,f])),ordered=[];
for(const old of closure.generatedFiles){let path=old.path;if(!remaining.has(path)&&path.startsWith('assets/index-')){const matches=[...remaining.keys()].filter(p=>p.startsWith('assets/index-')&&p.split('.').at(-1)===path.split('.').at(-1));if(matches.length===1)path=matches[0];}if(remaining.has(path)){ordered.push(remaining.get(path));remaining.delete(path);}}
closure.generatedFiles=[...ordered,...remaining.values()];const bytes=readFileSync(closure.workerSnapshot.path);closure.workerSnapshot.sha256=hash(bytes);closure.workerSnapshot.bytes=bytes.length;closure.workerSnapshot.records=JSON.parse(bytes).records.length;
writeFileSync(file,JSON.stringify(closure,null,2)+'\n');console.log(JSON.stringify({sourcePins:closure.changedSources.length,generatedPins:closure.generatedFiles.length,workerRecords:closure.workerSnapshot.records,scope:'Local pins only; independent review and required tests remain mandatory.'}));
