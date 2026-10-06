// Append-only GitHub evidence storage. Never checks out or executes downloaded evidence.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const repository='klappy/fia-app',branch='fia-persona-evidence';
export function entries(summary,{runId,attempt}){
 if(summary.schema!=='fia-listening-persona-summary@1'||!/^[a-f0-9]{40}$/.test(summary.commit)||!['dev','staging','production'].includes(summary.environment)||!/^\d+$/.test(runId)||!/^\d+$/.test(attempt)||!Array.isArray(summary.scenarios)||!summary.scenarios.length)throw Error('Invalid archive identity');
 const seen=new Set();return summary.scenarios.map(s=>{if(typeof s.scenario!=='string'||!['passed','failed','not-covered'].includes(s.outcome)||s.key!==`${summary.commit}/${summary.environment}/${s.scenario}`||s.outcome==='passed'&&s.validation?.ok!==true)throw Error('Invalid scenario');const id=createHash('sha256').update(s.scenario).digest('hex');if(seen.has(id))throw Error('Duplicate scenario');seen.add(id);return {path:`${summary.commit}/${summary.environment}/${runId}-${attempt}/${id}.json`,content:JSON.stringify({schema:summary.schema,commit:summary.commit,environment:summary.environment,runId,attempt,workflowUrl:`https://github.com/${repository}/actions/runs/${runId}`,scope:summary.scope,scenario:s},null,2)+'\n'};});
}
export async function append(items,api){
 let ref=await api('GET',`git/ref/heads/${branch}`,undefined,true);
 if(!ref){const tree=await api('POST','git/trees',{tree:[]});const initial=await api('POST','git/commits',{message:'Initialize append-only persona evidence',tree:tree.sha,parents:[]});await api('POST','git/refs',{ref:`refs/heads/${branch}`,sha:initial.sha});ref={object:{sha:initial.sha}};}
 const head=ref.object.sha,commit=await api('GET',`git/commits/${head}`);const additions=[];
 for(const item of items){const old=await api('GET',`contents/${item.path}?ref=${branch}`,undefined,true);if(old){if(old.encoding!=='base64'||Buffer.from(old.content,'base64').toString()!==item.content)throw Error('Refusing conflicting immutable evidence: '+item.path);continue;}additions.push({...item,mode:'100644',type:'blob'});}
 if(!additions.length)return {outcome:'already-archived',commit:head};
 const tree=await api('POST','git/trees',{base_tree:commit.tree.sha,tree:additions});const next=await api('POST','git/commits',{message:'Append release persona observations',tree:tree.sha,parents:[head]});await api('PATCH',`git/refs/heads/${branch}`,{sha:next.sha,force:false});return {outcome:'archived',commit:next.sha};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.GITHUB_REPOSITORY!==repository||!['push','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)||!['refs/heads/main','refs/heads/staging','refs/heads/production'].includes(process.env.GITHUB_REF))throw Error('Trusted deployment branch required');
 const api=async(method,path,body,optional=false)=>{const response=await fetch(`https://api.github.com/repos/${repository}/${path}`,{method,headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined});if(optional&&response.status===404)return null;if(!response.ok)throw Error(`Archive API ${method} ${path}: ${response.status}`);return response.json();};
 const summary=JSON.parse(readFileSync(process.argv[2],'utf8'));if(summary.commit!==process.env.EXPECT_COMMIT||summary.environment!==process.env.FIA_ENVIRONMENT)throw Error('Archive target does not match workflow target');console.log(JSON.stringify(await append(entries(summary,{runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT}),api)));
}
