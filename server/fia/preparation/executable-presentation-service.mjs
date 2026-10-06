import {canonicalJSONString,sha256} from './contract.mjs';
import {createDecisionJobs} from './executor/decision-jobs.mjs';
import {createRequestSidecars} from './executor/request-sidecars.mjs';
import {projectExecutablePresentation,validateSourceActionDecision,canonicalSourceOrder,SOURCE_ACTION_RECIPE} from '../compiler/presentation/source-action-projector.mjs';
const encode=v=>new TextEncoder().encode(canonicalJSONString(v)),same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),need=(v,r)=>{if(!v)throw Error(r);};
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join()===keys.toSorted().join();
export function validExecutablePresentationRequest(v){return exact(v,['packId','baseRevision','sourceRevision','capability'])&&typeof v.packId==='string'&&v.packId.length>0&&v.packId.length<=256&&hash(v.baseRevision)&&typeof v.sourceRevision==='string'&&v.sourceRevision.length>0&&v.sourceRevision.length<=256&&v.capability==='executable-presentation';}
const unavailablePolicy=await sha256('fia-source-action-provider-unavailable@1'),contractSha256=await sha256('fia-source-to-app/7fa17af806c139cfc353cace39fa6d50ed9e061b');
// Resolver/authority/narration ports are trusted server composition. A provider is
// never invoked by read(); publication remains the caller's validated overlay.
export function createExecutablePresentationService({storage,artifacts,resolve,eligible,interpret=null,narrationFor=null,policySha256,recipeRevision=SOURCE_ACTION_RECIPE,decisionJobs=createDecisionJobs}){
 need(typeof storage?.transaction==='function'&&typeof artifacts?.read==='function'&&typeof artifacts?.write==='function'&&typeof resolve==='function'&&typeof eligible==='function'&&hash(policySha256)&&typeof recipeRevision==='string'&&recipeRevision&&(!interpret||hash(interpret.dependencySha256)&&typeof interpret.run==='function')&&(!narrationFor||typeof narrationFor==='function'),'execution-service-ports');
 const providerSha256=interpret?.dependencySha256??unavailablePolicy;
 async function allowed(args,phase){return await eligible(structuredClone(args),phase)===true;}
 async function retain(value){const bytes=encode(value);need(bytes.length<=1048576,'execution-context-size');const digest=await sha256(bytes),d=await artifacts.write(bytes);need(d?.sha256===digest&&typeof d.reference==='string','execution-artifact-write');const retained=await artifacts.read(d);need(retained instanceof Uint8Array&&retained.length===bytes.length&&await sha256(retained)===digest,'execution-artifact-readback');return d;}
 async function load(d){need(d&&hash(d.sha256)&&typeof d.reference==='string','execution-artifact');const bytes=await artifacts.read(d);need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=1048576&&await sha256(bytes)===d.sha256,'execution-artifact-integrity');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 function wire(context){return {...structuredClone(context),boundArtifacts:(context.boundArtifacts??[]).map(a=>({...a,bytes:Array.from(a.bytes)}))};}
 function unwire(context){return {...context,boundArtifacts:(context.boundArtifacts??[]).map(a=>({...a,bytes:new Uint8Array(a.bytes)}))};}
 async function contextValid(c,args){need(c.basePresentation?.id===args.packId&&c.baseRevision===args.baseRevision&&c.sourceRevision===args.sourceRevision&&typeof c.language==='string'&&await canonicalSourceOrder(c.canonicalUnits)===c.canonicalOrderSha256&&Array.isArray(c.decisions)&&c.decisions.length<=c.canonicalUnits.length,'execution-resolved-context');}
 async function unknown(input){return {contract:'fia-source-action-result@1',inputSha256:await sha256(encode(input)),cueRoles:input.requestedDecisions.includes('cue-roles')?{outcome:'unknown',roles:null,evidenceUnitIds:[]}:null,resourceAssociations:input.requestedDecisions.includes('resource-association')?input.intentSlots.map(s=>({slotId:s.slotId,resourceKind:s.resourceKind,relation:s.relation,outcome:'unsupported',candidateResourceIds:[],evidenceUnitIds:[],reason:'provider-unavailable'})):[],provenance:{mode:'none',contractSha256,schemaSha256:'f099b6e1ba06414ac353dd1847b9f25300c68917cda12c5c6065033fd51144e2',questionSha256:await sha256(encode(input)),policySha256,modelRevision:null,configSha256:providerSha256,rawEvidenceSha256:null}};}
 async function jobsFor(c,args,record){
  need(record&&Object.keys(record).every(k=>['input','explicitResult'].includes(k))&&record.input,'execution-decision-plan');
  const input=record.input;await validateSourceActionDecision(input,record.explicitResult??await unknown(input),c);
  if(c.guideContentSha256)need(input.guideContentSha256===c.guideContentSha256,'execution-guide-binding');
  let current=await allowed(args,'decision');
  const dependencySha256=await sha256(encode({policySha256,providerSha256,recipeRevision}));
  const jobInput={identity:{input,explicitResult:record.explicitResult??null},dependencies:{input:await sha256(encode(input)),policy:policySha256,provider:providerSha256,base:c.baseRevision,sourceOrder:c.canonicalOrderSha256}};
  const jobs=decisionJobs({storage,artifacts,dependencySha256,maxBytes:65536,stepMs:10000,eligibility:()=>current,run:async(_,{signal})=>{current=await allowed(args,'interpret');need(current,'execution-ineligible');const result=record.explicitResult??(interpret?await interpret.run(structuredClone(input),{signal}):await unknown(input));current=await allowed(args,'interpreted');need(current,'execution-ineligible');return encode(result);},validate:async bytes=>{const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));await validateSourceActionDecision(input,result,c);need(result.provenance.policySha256===policySha256,'execution-decision-policy');current=await allowed(args,'decision-verified');return current;}});
  return {jobs,input:jobInput};
 }
 async function output(row,demand,subscriberId){
  const args=row.args;if(!await allowed(args,'read'))return {status:'blocked',jobId:row.jobId,reason:'execution-ineligible'};
  const context=unwire(await load(row.context));await contextValid(context,args);const decisions=[],evidence=[row.context];
  for(const record of context.decisions){const {jobs,input}=await jobsFor(context,args,record),outcome=await(demand?jobs.request(input):jobs.read(input));if(outcome.state!=='completed')return {status:['preparing','missing'].includes(outcome.state)?'preparing':['uncertain','blocked'].includes(outcome.state)?'blocked':'unavailable',jobId:row.jobId,reason:outcome.reason??outcome.state};decisions.push({input:record.input,result:JSON.parse(new TextDecoder().decode(outcome.bytes))});evidence.push(outcome.artifact);}
  const projected=await projectExecutablePresentation({...context,decisions,recipeRevision});
  const binding={consumer:args,sharedRequest:{jobId:row.jobId},capability:'executable-presentation',contractSha256,dependencies:{context:row.context.sha256,decisions:await sha256(encode(decisions)),policy:policySha256,provider:providerSha256,recipe:await sha256(recipeRevision)}};
  const sidecars=createRequestSidecars({storage,artifacts,resolve:()=>binding,shared:{request:async()=>({state:'completed'})},project:()=>({outcome:'accept',reason:'validated-executable-presentation',capability:'executable-presentation',evidence,result:projected.presentation}),eligible:()=>allowed(args,'sidecar'),validate:async sidecar=>same(sidecar.decision.result,projected.presentation)&&await allowed(args,'projected')});
  const prior=await sidecars.read({});
  // Read-only status never materializes a missing sidecar. Explicit demand can
  // recover deterministic projection after a job completed before publication.
  const result=prior.state==='missing'&&demand?await sidecars.request({},{subscriberId:subscriberId??`presentation:${crypto.randomUUID()}`}):prior;
  if(result.state!=='ready')return {status:result.state==='missing'?'preparing':result.state==='detached'?'blocked':'unavailable',jobId:row.jobId,reason:result.reason??result.state};
  if(!await allowed(args,'return'))return {status:'blocked',jobId:row.jobId,reason:'execution-ineligible'};
  return {status:'ready',jobId:row.jobId,...projected};
 }
 async function request(args,{subscriberId}={}){
  need(validExecutablePresentationRequest(args),'execution-request');if(!await allowed(args,'request'))return {status:'blocked',reason:'execution-ineligible'};
  const context=await resolve(structuredClone(args));await contextValid(context,args);
  context.narrationBindings={...(context.narrationBindings??{})};if(narrationFor)for(const activity of context.basePresentation.activities)context.narrationBindings[activity.id]=await narrationFor(structuredClone(activity),structuredClone(context));
  // Validate structure, source ordering and bound narration before admitting jobs.
  await projectExecutablePresentation({...context,decisions:[],recipeRevision});
  const retained=await retain(wire(context)),jobId=await sha256(encode({schema:'fia-executable-presentation-job@1',args,context:retained.sha256,policySha256,providerSha256,recipeRevision})),row={schema:'fia-executable-presentation-request@1',jobId,args:structuredClone(args),context:retained,policySha256,providerSha256,recipeRevision};
  await storage.transaction(async tx=>{const key='executable-presentation:job:'+jobId,old=await tx.get(key);need(!old||same(old,row),'execution-request-conflict');await tx.put(key,row);});
  return output(row,true,subscriberId);
 }
 async function read({jobId}){need(hash(jobId),'execution-job-id');const row=await storage.transaction(tx=>tx.get('executable-presentation:job:'+jobId));if(!row)return {status:'unavailable',jobId,reason:'not-found'};need(row.schema==='fia-executable-presentation-request@1'&&row.jobId===jobId&&row.policySha256===policySha256&&row.providerSha256===providerSha256&&row.recipeRevision===recipeRevision,'execution-job-policy');return output(row,false);}
 return Object.freeze({request,read});
}
