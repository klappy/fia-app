import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
const requireValue=(ok,message)=>{if(!ok)throw Error(message);};
export async function verifyPromotion({repo,prNumber,api,waitMs=0,pollMs=20000,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),readWorkflow=path=>readFileSync(new URL('../'+path,import.meta.url))}){
 const pr=await api(`/repos/${repo}/pulls/${prNumber}`),base=pr.base?.ref,upstream={staging:{branch:'main',environment:'dev'},production:{branch:'staging',environment:'staging'}}[base];
 requireValue(pr.state==='open'&&upstream&&pr.head?.repo?.full_name===repo&&pr.head.ref===upstream.branch,'Promotion must use the same-repository upstream branch');
 const sha=pr.head.sha;requireValue(/^[a-f0-9]{40}$/.test(sha),'Invalid source head');
 const receipts=[];
 for(const spec of [{file:'ci.yml',job:'check',steps:['Controlled local listening and cancellation']},{file:'post-deploy.yml',job:'deployed-listening',steps:['Wait for version.json to report the commit (10 min)','Controlled local listening','Hosted listening journey','Verify separate hosted and controlled listening receipts']}]){
  const path=`.github/workflows/${spec.file}`,remote=await api(`/repos/${repo}/contents/${path}?ref=${sha}`);
  requireValue(remote.encoding==='base64'&&hash(Buffer.from(remote.content,'base64'))===hash(readWorkflow(path)),`Reviewed workflow differs at source head: ${path}`);
  // Wait for the exact-head upstream run to finish instead of racing it (ci/post-deploy start on the same push).
  let matching=[];
  for(const deadline=now()+waitMs;;){
   const runs=await api(`/repos/${repo}/actions/workflows/${spec.file}/runs?head_sha=${sha}&event=push&branch=${upstream.branch}&per_page=100`);
   matching=(runs.workflow_runs||[]).filter(r=>r.head_sha===sha&&r.head_branch===upstream.branch&&r.event==='push'&&r.path===path).sort((a,b)=>b.id-a.id);
   if(matching.length>0&&matching[0].status==='completed'||now()>=deadline)break;
   await sleep(pollMs);
  }
  requireValue(matching.length>0,`Missing exact-head push evidence: ${spec.file}`);const run=matching[0];
  requireValue(run.status==='completed'&&run.conclusion==='success',`Latest exact-head run did not succeed: ${spec.file}`);
  const jobs=await api(`/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`),selected=(jobs.jobs||[]).filter(j=>j.name===spec.job);
  requireValue(selected.length===1&&selected[0].status==='completed'&&selected[0].conclusion==='success',`Missing successful mandatory job: ${spec.job}`);
  for(const name of spec.steps){const steps=selected[0].steps.filter(s=>s.name===name);requireValue(steps.length===1&&steps[0].status==='completed'&&steps[0].conclusion==='success',`Missing successful evidence step: ${name}`);}
  receipts.push({workflow:path,runId:run.id,runUrl:run.html_url,jobId:selected[0].id,workflowSha256:hash(readWorkflow(path))});
 }
 // Re-read to refuse a source branch moving during the evidence lookup.
 const latest=await api(`/repos/${repo}/pulls/${prNumber}`);requireValue(latest.head.sha===sha&&latest.head.ref===upstream.branch&&latest.base.ref===base,'Promotion source changed during verification');
 return {status:'verified',sourceSha:sha,sourceBranch:upstream.branch,upstreamEnvironment:upstream.environment,targetBranch:base,receipts};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {GITHUB_REPOSITORY:repo,GITHUB_TOKEN:token,PR_NUMBER:prNumber}=process.env;
 const api=async path=>{const response=await fetch(`https://api.github.com${path}`,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`GitHub evidence API ${response.status}`);return response.json();};
 try{requireValue(repo&&token&&/^\d+$/.test(prNumber||''),'Missing trusted workflow context');console.log(JSON.stringify(await verifyPromotion({repo,prNumber,api,waitMs:Number(process.env.EVIDENCE_WAIT_MS||0)}),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
