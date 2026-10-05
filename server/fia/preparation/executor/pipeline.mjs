import {canonicalJSONString,sha256} from '../contract.mjs';
const nodes=['discover','acquire','transcribe','align','accept','publish'];
const clone=value=>structuredClone(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function shape(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw Error('invalid-pipeline-input');}
function inputIdentity(input){
 canonicalJSONString(input);shape(input,['packId','book','language','edition','passage','resource','scriptSha256','source','modelRecipe','policyRevision']);
 shape(input.source,['publisherId','resourceId','version']);shape(input.modelRecipe,['modelId','modelRevision','configSha256']);
 for(const value of [...Object.values(input).filter(v=>typeof v!=='object'),...Object.values(input.source),...Object.values(input.modelRecipe)])if(typeof value!=='string'||!value.trim()||value.length>4096)throw Error('invalid-pipeline-input');
 if(!hash(input.scriptSha256)||!hash(input.modelRecipe.configSha256))throw Error('invalid-pipeline-input');return clone(input);
}
function artifact(value){
 if(!value||!hash(value.sha256)||typeof value.reference!=='string'||!value.reference.trim())throw Error('invalid-pipeline-artifact');canonicalJSONString(value);return clone(value);
}
export function createPipeline({storage,policyId,adapters,verifyArtifact,allowPaid=false}){
 if(typeof policyId!=='string'||!policyId.trim()||typeof verifyArtifact!=='function'||typeof storage?.transaction!=='function')throw Error('invalid-pipeline-policy');
 const captured=Object.fromEntries(nodes.map(node=>[node,adapters?.[node]?Object.freeze({...adapters[node]}):null]));
 const verify=verifyArtifact;
 async function checked(output,input,node){
  const copy=artifact(output),retained=await verify(clone(copy),{input:clone(input),node});
  if(!(retained instanceof Uint8Array))throw Error('artifact-unavailable');
  const bytes=retained.slice();if(await sha256(bytes)!==copy.sha256)throw Error('artifact-unavailable');
  const verified={sha256:copy.sha256,reference:copy.reference};
  if(node==='accept'){const content=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!['machine-accepted','review-accepted','review-required'].includes(content?.status))throw Error('invalid-acceptance-artifact');verified.status=content.status;}
  return verified;
 }
 async function keyFor(input){return sha256(canonicalJSONString({schema:'fia-preparation-operation@1',policyId,input}));}
 async function nodeIdentity(input,node,outputs){
  const base={schema:'fia-preparation-node@1',policyId,policyRevision:input.policyRevision,node};
  if(node==='discover')return {...base,source:input.source,selection:{book:input.book,language:input.language,edition:input.edition,passage:input.passage,resource:input.resource}};
  if(node==='acquire')return {...base,discoverySha256:outputs.discover.sha256};
  if(node==='transcribe')return {...base,audioSha256:outputs.acquire.sha256,language:input.language,modelRecipe:input.modelRecipe};
  return {...base,input,parentHashes:Object.fromEntries(Object.entries(outputs).map(([name,item])=>[name,item.sha256]))};
 }
 async function read(tx,nodeKey,identity){
  const row=await tx.get(nodeKey);if(!row)return null;
  if(row.schema!=='fia-preparation-node@1'||row.nodeKey!==nodeKey||canonicalJSONString(row.identity)!==canonicalJSONString(identity)||!['preparing','completed','uncertain','failed'].includes(row.state)||typeof row.attemptId!=='string'||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('corrupt-pipeline-state');
  return row;
 }
 async function run(raw){
  const input=inputIdentity(raw),key=await keyFor(input),outputs={};
  for(const node of nodes){
   const identity=await nodeIdentity(input,node,outputs),nodeKey=await sha256(canonicalJSONString(identity));
   const acquired=await storage.transaction(async tx=>{
    const existing=await read(tx,nodeKey,identity);
    if(existing){if(existing.nodeKey!==nodeKey)throw Error('pipeline-parent-mismatch');return {record:clone(existing),owned:false};}
    const adapter=captured[node];if(!adapter||typeof adapter.run!=='function'||typeof adapter.paid!=='boolean'||adapter.paid&&!allowPaid)return {record:{state:'blocked',reason:'capability-unavailable',nodeKey},owned:false};
    const record={schema:'fia-preparation-node@1',identity,context:clone(input),state:'preparing',nodeKey,revision:1,attemptId:globalThis.crypto.randomUUID()};await tx.put(nodeKey,record);return {record:clone(record),owned:true};
   });
   const claim=acquired.record;
   if(claim.state==='completed'){
    try{outputs[node]=await checked(claim.artifact,input,node);}catch{return {key,state:'unavailable',node,reason:'retained-artifact-invalid'};}
   }else if(claim.state!=='preparing'||!acquired.owned)return {key,node,...claim};
   else {
    let output;
    try{output=await checked(await captured[node].run({input:clone(input),nodeOutputs:clone(outputs),attemptId:claim.attemptId}),input,node);}
    catch(error){await settle(claim,{state:'uncertain',reason:'adapter-outcome-unresolved'});return {key,node,state:'uncertain',attemptId:claim.attemptId};}
    await settle(claim,{state:'completed',artifact:output});outputs[node]=output;
   }
   if(node==='accept'&&!['machine-accepted','review-accepted'].includes(outputs[node].status))return {key,node,state:'blocked',reason:'review-required',artifact:outputs[node]};
  }
  return {key,state:'ready',artifact:outputs.publish,outputs};
 }
 async function settle(claim,outcome){
  return storage.transaction(async tx=>{const current=await read(tx,claim.nodeKey,claim.identity);if(current?.state!=='preparing'||current.attemptId!==claim.attemptId||current.revision!==claim.revision)throw Error('stale-pipeline-attempt');Object.assign(current,outcome);current.revision++;await tx.put(claim.nodeKey,current);});
 }
 async function reconcile(raw,node,report){
  const input=inputIdentity(raw);
  if(!nodes.includes(node)||!report||!hash(report.nodeKey)||typeof report.attemptId!=='string'||!Number.isSafeInteger(report.revision)||report.revision<1||typeof report.evidence!=='string'||!report.evidence.trim()||!['completed','failed','uncertain'].includes(report.outcome))throw Error('invalid-pipeline-reconciliation');
  const pinned=clone(report);const output=pinned.outcome==='completed'?await checked(pinned.artifact,input,node):null;
  return storage.transaction(async tx=>{const current=await tx.get(pinned.nodeKey);if(!current||canonicalJSONString(current.context)!==canonicalJSONString(input)||current.identity.node!==node||current.identity.policyId!==policyId||current.identity.policyRevision!==input.policyRevision||!['preparing','uncertain'].includes(current.state)||current.attemptId!==pinned.attemptId||current.revision!==pinned.revision)throw Error('stale-pipeline-reconciliation');
   // Internal trusted reconciliation is bound to the exact persisted node and attempt.
   if(await sha256(canonicalJSONString(current.identity))!==pinned.nodeKey)throw Error('corrupt-pipeline-state');
   Object.assign(current,{state:pinned.outcome,evidence:pinned.evidence,...(output?{artifact:output}:{})});current.revision++;await tx.put(pinned.nodeKey,current);return clone(current);});
 }
 return {run,reconcile};
}
