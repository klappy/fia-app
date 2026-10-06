import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {required} from './verify.mjs';
export function summarize(report,{commit,environment,baseline=null,readAttachment=p=>readFileSync(p,'utf8')}={}){
 if(!/^[a-f0-9]{40}$/.test(commit||'')||!['dev','staging','production'].includes(environment))throw Error('Exact release and environment required');
 const specs=[];function walk(s){specs.push(...(s.specs||[]));for(const c of s.suites||[])walk(c);}walk(report);
 return {schema:'fia-listening-persona-summary@1',commit,environment,scope:'Agent-operated rendered Chromium observations; not human research or acoustic/device proof',scenarios:[...required.keys()].map(scenario=>{
  const matches=specs.filter(s=>s.title===scenario),runs=matches.flatMap(s=>(s.tests||[]).flatMap(t=>t.results||[]));let evidence=null;const attachment=runs[0]?.attachments?.find(a=>a.name==='live-listening-evidence');try{if(attachment)evidence=JSON.parse(attachment.body?Buffer.from(attachment.body,'base64').toString():readAttachment(attachment.path));}catch{}
  const origins={dev:'https://dev.fiaguide.app',staging:'https://staging.fiaguide.app',production:'https://fiaguide.app'};
  const bound=evidence?.origin===origins[environment]&&evidence?.networkVersion?.commit===commit&&evidence?.loadedCommit===commit&&evidence?.expectedCommit===commit&&evidence?.environment===environment;
  const outcome=matches.length!==1||runs.length!==1?'not-covered':runs[0].status==='passed'&&bound&&!report.errors?.length?'passed':runs[0].status==='skipped'?'not-covered':'failed';
  const notices=(evidence?.observations||[]).filter(o=>o.kind==='visible-notices'||o.kind==='pageerror');
  const prior=baseline?.environment===environment?baseline.scenarios?.find(x=>x.scenario===scenario):null;
  return {key:`${commit}/${environment}/${scenario}`,scenario,outcome,failedStep:outcome==='failed'?(runs[0]?.error?.message||runs[0]?.errors?.[0]?.message||'Evidence identity or scenario assertion failed'):null,observedFriction:{classification:'observation-only',notices,assessment:'Not inferred from pass/fail; review attached observations'},userFeedback:{status:'not-collected'},evidence:attachment?{name:attachment.name,sha256:createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),workflowArtifacts:'test-results (trace/video retention is finite)',identityBound:bound}:null,baselineComparison:prior?{baselineCommit:baseline.commit,priorOutcome:prior.outcome,currentOutcome:outcome,scope:'Outcome comparison only; no sentiment inference'}:{status:'not-covered',reason:'No same-environment scenario baseline supplied'}};
 })};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [reportPath,out,baselinePath]=process.argv.slice(2);let report;try{report=JSON.parse(readFileSync(reportPath,'utf8'));}catch{report={};}const summary=summarize(report,{commit:process.env.EXPECT_COMMIT,environment:process.env.FIA_ENVIRONMENT,baseline:baselinePath?JSON.parse(readFileSync(baselinePath,'utf8')):null});mkdirSync(out,{recursive:true});writeFileSync(join(out,`${summary.commit}-${summary.environment}.json`),JSON.stringify(summary,null,2)+'\n');}
