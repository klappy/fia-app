import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {required,verify,verifyControlled} from './verify.mjs';
export const controlledScenarios=new Map([
 ['cancel','Controlled pending guide OFF→ON does not resurrect playback'],
 ['cancel-button','Controlled Cancel preparation does not resurrect playback'],
 ['manual','Controlled Ready stays silent until explicit Play']
]);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function summarize(report,{commit,environment,controlled=null,baseline=null,readAttachment=p=>readFileSync(p,'utf8')}={}){
 if(!/^[a-f0-9]{40}$/.test(commit||'')||!['dev','staging','production'].includes(environment))throw Error('Exact release and environment required');
 let hostedVerdict;try{hostedVerdict=verify(report,{commit,environment,controlled,readAttachment});}catch(error){hostedVerdict={ok:false,errors:[error.message]};}
 let controlledVerdict;try{verifyControlled(controlled,commit);controlledVerdict={ok:true,errors:[]};}catch(error){controlledVerdict={ok:false,errors:[error.message]};}
 const specs=[];function walk(s){specs.push(...(s.specs||[]));for(const c of s.suites||[])walk(c);}walk(report);
 function row(scenario,{outcome,scope,validation,failedStep=null,notices=[],evidence=null}){
  const prior=baseline?.environment===environment?baseline.scenarios?.find(x=>x.scenario===scenario):null;
  return {key:`${commit}/${environment}/${scenario}`,scenario,scope,outcome,validation,failedStep,observedFriction:{classification:'observation-only',notices,assessment:'Not inferred from pass/fail; review attached observations'},userFeedback:{status:'not-collected'},evidence,baselineComparison:prior?{baselineCommit:prior.baselineCommit||baseline.commit,priorOutcome:prior.outcome,currentOutcome:outcome,archivePath:prior.archivePath||null,scope:'Outcome comparison only; no sentiment inference'}:{status:'not-covered',reason:baseline?.reason||'No same-environment prior scenario found'}};
 }
 const scenarios=[...required.keys()].map(scenario=>{
  const matches=specs.filter(s=>s.title===scenario),runs=matches.flatMap(s=>(s.tests||[]).flatMap(t=>t.results||[]));let evidence=null;const attachment=runs[0]?.attachments?.find(a=>a.name==='live-listening-evidence');try{if(attachment)evidence=JSON.parse(attachment.body?Buffer.from(attachment.body,'base64').toString():readAttachment(attachment.path));}catch{}
  const incomplete=matches.length!==1||runs.length!==1||runs[0]?.status==='skipped';
  const outcome=incomplete?'not-covered':runs[0].status==='passed'&&hostedVerdict.ok?'passed':'failed';
  return row(scenario,{outcome,scope:'hosted-rendered-native',validation:{validator:'verify',...hostedVerdict},failedStep:outcome==='failed'?(runs[0]?.error?.message||runs[0]?.errors?.[0]?.message||hostedVerdict.errors.join('; ')):incomplete?'Scenario missing, skipped or ambiguous':null,notices:(evidence?.observations||[]).filter(o=>o.kind==='visible-notices'||o.kind==='pageerror'),evidence:attachment?{name:attachment.name,sha256:hash(evidence),workflowArtifacts:'test-results (trace/video retention is finite)'}:null});
 });
 for(const [mode,scenario] of controlledScenarios){const claims=controlled?.claims?.filter(x=>x.mode===mode)||[];const incomplete=claims.length!==1;
  const outcome=incomplete?'not-covered':controlledVerdict.ok?'passed':'failed';
  scenarios.push(row(scenario,{outcome,scope:'controlled-local-protocol-fixture; real native media, not hosted Worker',validation:{validator:'verifyControlled',...controlledVerdict},failedStep:incomplete?'Controlled scenario missing or ambiguous':controlledVerdict.ok?null:controlledVerdict.errors.join('; '),evidence:controlled?{name:'controlled-pending.json',sha256:hash(controlled),claimMode:mode,loadedCommit:claims[0]?.loadedCommit||null}:null}));
 }
 return {schema:'fia-listening-persona-summary@1',commit,environment,scope:'Agent-operated observations; not human research or acoustic/device proof. Hosted and controlled protocol scopes are separate.',scenarios};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [reportPath,out,baselinePath,controlledPath]=process.argv.slice(2);const read=p=>{try{return JSON.parse(readFileSync(p,'utf8'));}catch{return null;}};const summary=summarize(read(reportPath)||{},{commit:process.env.EXPECT_COMMIT,environment:process.env.FIA_ENVIRONMENT,baseline:read(baselinePath),controlled:read(controlledPath)});mkdirSync(out,{recursive:true});writeFileSync(join(out,`${summary.commit}-${summary.environment}.json`),JSON.stringify(summary,null,2)+'\n');}
