// Read-only history lookup. Archived JSON is data, never executable code.
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {repository,branch} from './archive-persona.mjs';
import {required} from './verify.mjs';
import {controlledScenarios} from './persona-summary.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
export async function loadBaseline({environment,runId,api}){
 if(!['dev','staging','production'].includes(environment)||!/^\d+$/.test(runId))throw Error('Invalid baseline target');
 const known=new Set([...required.keys(),...controlledScenarios.values()]);
 const tree=await api(`git/trees/${branch}?recursive=1`,true);if(!tree)return {environment,scenarios:[],reason:'Evidence branch does not yet exist'};
 if(tree.truncated||!Array.isArray(tree.tree))throw Error('Incomplete archive tree');
 const selected=new Map();
 for(const entry of tree.tree){if(entry.type!=='blob')continue;const match=/^([a-f0-9]{40})\/(dev|staging|production)\/(\d+)-(\d+)\/([a-f0-9]{64})\.json$/.exec(entry.path);if(!match||match[2]!==environment||BigInt(match[3])>=BigInt(runId))continue;if(!/^[a-f0-9]{40}$/.test(entry.sha))throw Error('Invalid archive blob identity');const key=match[5],old=selected.get(key);if(!old||BigInt(match[3])>BigInt(old.match[3])||match[3]===old.match[3]&&BigInt(match[4])>BigInt(old.match[4]))selected.set(key,{entry,match});}
 const scenarios=[];
 for(const {entry,match} of selected.values()){
  const blob=await api(`git/blobs/${entry.sha}`);if(blob.encoding!=='base64')throw Error('Unexpected archive blob encoding');const bytes=Buffer.from(blob.content,'base64');if(bytes.length>1024*1024)throw Error('Oversized history record');const gitSha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');if(gitSha!==entry.sha)throw Error('Archive blob hash mismatch');const record=JSON.parse(bytes),s=record.scenario;
  if(record.schema!=='fia-listening-persona-summary@1'||record.commit!==match[1]||record.environment!==environment||record.runId!==match[3]||record.attempt!==match[4]||!known.has(s?.scenario)||digest(s.scenario)!==match[5]||s.key!==`${match[1]}/${environment}/${s.scenario}`||!['passed','failed','not-covered'].includes(s.outcome)||s.outcome==='passed'&&s.validation?.ok!==true)throw Error('Invalid immutable history identity or verdict');
  scenarios.push({scenario:s.scenario,outcome:s.outcome,baselineCommit:record.commit,archivePath:entry.path,evidenceSha256:digest(bytes)});
 }
 return {environment,scenarios,reason:scenarios.length?null:'No prior same-environment run'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const output=process.argv[2];let result;try{result=await loadBaseline({environment:process.env.FIA_ENVIRONMENT,runId:process.env.GITHUB_RUN_ID,api:async(path,optional=false)=>{const response=await fetch(`https://api.github.com/repos/${repository}/${path}`,{headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json'}});if(optional&&response.status===404)return null;if(!response.ok)throw Error(`Baseline read ${response.status}`);return response.json();}});}catch(error){result={environment:process.env.FIA_ENVIRONMENT,scenarios:[],reason:`Baseline unavailable: ${error.message}`};process.exitCode=1;}mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');}
