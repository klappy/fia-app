import test from 'node:test';import assert from 'node:assert/strict';
import {createExecutableOperations,validVisualDemand} from '../../server/fia/publication/executable-operations.mjs';
// The previous build's operations, byte for byte (fixture copied from PR283 head 11611967): the
// frozen-previous-runtime gate (PLAN §7 F5a, §3 versions overlap).
import {createExecutableOperations as previousOperations} from './fixtures/executable-operations-previous.mjs';
import {declareVisualResources,trustedVisualPlacements,visualSourceEligible} from '../../server/fia/preparation/visual-resources.mjs';
import {readFileSync} from 'node:fs';

const h=c=>c.repeat(64),packId='eng.MRK-1-14-20';
const base=JSON.parse(readFileSync('apps/web/public/content/packs/eng.MRK-1-14-20/92ad518474f159f6567124052ae12d180a482c949509da0b725593442e62f746.json','utf8'));
// A served executable presentation shaped as the trusted placement publishes it (see executable-transition).
function presentation(){const p=structuredClone(base);const i=p.activities.findIndex(a=>a.id==='S02-U008');for(const a of p.activities)a.execution={narration:{action:'none'},focalAssetId:a.assetId??null,completion:{action:'manual-continue'}};const a=p.activities[i];a.kind='discussion';a.assetId='a1400';a.execution.focalAssetId='a1400';p.activities.splice(i+1,0,{...structuredClone(a),id:'S02-U008-resource-c4',assetId:'c4',fulfills:'S02-U008',narration:'',execution:{narration:{action:'none'},focalAssetId:'c4',completion:{action:'manual-continue'}}});return p;}
const record=(revision=h('e'))=>({status:'ready',packId,revision,artifact:{sha256:revision,bytes:1,mime:'application/json'},execution:{schema:'fia-executable-catalog@1',baseRevision:h('b'),sourceRevision:'f8776d92b090b5af5b17b17dc1137f25fb059ed0',artifacts:[],mediaIdentity:{packId,revision:h('b')},mediaAssetsSha256:h('m'),provenance:{}}});
function harness({current=record(),declared=null,visuals=null,move=null}={}){
 let served=current;const calls=[],storage={transaction:async fn=>fn({get:async()=>undefined,put:async()=>{}})};
 const reads={readPack:async args=>{calls.push(args);const r=structuredClone(served);if(args.execution==='2'&&r.execution)r.execution.visualResources=declared??declareVisualResources({record:r,presentation:presentation()});return r;}};
 const port=visuals&&{demand:async req=>{port.requests.push(req);if(move)served=record(move);return visuals(req);},requests:[]};
 return {ops:createExecutableOperations({reads,service:null,publication:null,storage,visuals:port}),calls,port,set:r=>served=r};
}
const demandFor=(assetId,kind,revision=h('e'))=>({packId,baseRevision:h('b'),sourceRevision:'f8776d92b090b5af5b17b17dc1137f25fb059ed0',capability:'executable-presentation',visualDemand:{assetId,kind},expectedExecutionRevision:revision});

test('F4: only the trusted S02-U008 placements are declared, a1400 then c4, each with its exact admissible demand',()=>{
 assert.deepEqual([...trustedVisualPlacements()],['eng.MRK-1-14-20 S02-U008 c4','eng.MRK-1-14-20 S02-U008 a1400']);
 const declared=declareVisualResources({record:record(),presentation:presentation()});
 assert.deepEqual(declared,[{assetId:'a1400',kind:'image',status:'preparable',preparationDemand:demandFor('a1400','image')},{assetId:'c4',kind:'map',status:'preparable',preparationDemand:demandFor('c4','map')}]);
 // A focal visual without a trusted placement is never declared; one whose source cannot qualify is visual-ineligible.
 const other=presentation();other.activities.find(a=>a.id==='S01-U001'||a.kind==='guide').execution.focalAssetId='a293';assert.deepEqual(declareVisualResources({record:record(),presentation:other}).map(e=>e.assetId),['a1400','c4']);
 const odd=presentation();odd.assets.c4.sourceEvidence.url='https://s3.amazonaws.com/x/original.png?sig=1';assert.deepEqual(declareVisualResources({record:record(),presentation:odd})[1],{assetId:'c4',kind:'map',status:'unavailable',reason:'visual-ineligible'});
 for(const mutate of [a=>a.rights.collection='FIAImages',a=>a.sourceEvidence.url='http://s3.amazonaws.com/c4.png',a=>a.sourceEvidence.url='https://s3.amazonaws.com/c4.svg',a=>delete a.sourceEvidence.sourceFileSha256]){const asset=structuredClone(base.assets.c4);mutate(asset);assert.equal(visualSourceEligible(asset),false);}
 assert.equal(visualSourceEligible(base.assets.c4),true);assert.equal(visualSourceEligible(base.assets.a1400),true);
 assert.equal(declareVisualResources({record:{...record(),execution:undefined},presentation:presentation()}),null,'a base record declares nothing');
});

test('F5a: a stale, forged, undeclared or ineligible demand is refused typed before any custody call',async()=>{
 const {ops,port}=harness({visuals:async()=>({state:'unavailable',reason:'decoder-unavailable'})});
 const answer=async args=>ops.preparePresentation(args);
 assert.deepEqual(await answer(demandFor('a1400','image',h('f'))),{schema:'fia-presentation-preparation@1',status:'blocked',jobId:null,reason:'execution-revision-stale',record:null});
 for(const [args,reason] of [[demandFor('a293','image'),'execution-admission-refused'],[{...demandFor('a1400','image'),baseRevision:h('c')},'execution-admission-refused'],[demandFor('c4','image'),'execution-admission-refused']])assert.equal((await answer(args)).reason,reason);
 for(const args of [{...demandFor('a1400','image'),decisionDemand:{}},{...demandFor('a1400','image'),extra:1},{...demandFor('a1400','video')},{...demandFor('a1400','image'),expectedExecutionRevision:'x'},{...demandFor('a1400','image'),visualDemand:{assetId:'a1400'}}])assert.deepEqual(await answer(args),{status:'refused',code:'invalid-request'});
 assert.equal(port.requests.length,0,'no refused demand reaches custody');
 const ineligible=harness({declared:[{assetId:'a1400',kind:'image',status:'unavailable',reason:'visual-ineligible'}],visuals:async()=>assert.fail('no call')});
 assert.deepEqual(await ineligible.ops.preparePresentation(demandFor('a1400','image')),{schema:'fia-presentation-preparation@1',status:'unavailable',jobId:null,reason:'visual-ineligible',record:null});
 const notExecutable=harness();notExecutable.set({...record(),execution:undefined});assert.equal((await notExecutable.ops.preparePresentation(demandFor('a1400','image'))).reason,'execution-admission-refused');
});

test('F5a: an admitted demand calls the routing port once and answers its typed outcome; nothing is published',async()=>{
 const {ops,port}=harness({visuals:async()=>({state:'unavailable',reason:'decoder-unavailable',custody:'retained'})});
 const key={visualDemand:{kind:'image',assetId:'a1400'}};
 const r=await ops.preparePresentation({...demandFor('a1400','image'),...key});
 assert.deepEqual(r,{schema:'fia-presentation-preparation@1',status:'unavailable',jobId:null,reason:'decoder-unavailable',record:null});
 assert.deepEqual(port.requests,[{packId,baseRevision:h('b'),sourceRevision:'f8776d92b090b5af5b17b17dc1137f25fb059ed0',executionRevision:h('e'),assetId:'a1400',kind:'image',retry:false}]);
 for(const [outcome,status,reason] of [[{state:'unavailable',reason:'visual-unsupported',subReason:'fresh-byte-limit'},'unavailable','visual-unsupported'],[{state:'unavailable',reason:'interrupted'},'unavailable','interrupted'],[{state:'ready'},'blocked','visual-publication-unavailable'],[{state:'unknown'},'unavailable','interrupted'],[null,'unavailable','interrupted']]){const t=harness({visuals:async()=>outcome});const a=await t.ops.preparePresentation(demandFor('c4','map'));assert.equal(a.status,status);assert.equal(a.reason,reason);}
 for(const error of [Error('visual-unsupported'),Error('anything at all'),new TypeError('x')]){const t=harness({visuals:async()=>{throw error;}});const a=await t.ops.preparePresentation(demandFor('c4','map'));assert.equal(a.status,'unavailable');assert.equal(a.reason,error.message==='visual-unsupported'?'visual-unsupported':'interrupted');}
 const unrouted=harness();assert.deepEqual(await unrouted.ops.preparePresentation(demandFor('c4','map')),{schema:'fia-presentation-preparation@1',status:'unavailable',jobId:null,reason:'visual-routing-unavailable',record:null});
});

test('F5a: compare-and-swap after custody: a newer execution adopted meanwhile makes the demand stale, typed',async()=>{
 const {ops,port}=harness({visuals:async()=>({state:'unavailable',reason:'decoder-unavailable'}),move:h('9')});
 assert.deepEqual(await ops.preparePresentation(demandFor('a1400','image')),{schema:'fia-presentation-preparation@1',status:'blocked',jobId:null,reason:'execution-revision-stale',record:null});
 assert.equal(port.requests.length,1,'the custody evidence stays with the job for the newer execution');
});

test('frozen previous runtime: the previous build answers a visual demand with its typed invalid-request, never an exception',async()=>{
 const storage={transaction:async fn=>fn({get:async()=>undefined,put:async()=>{}})};
 const ops=previousOperations({reads:{readPack:async()=>record()},service:{request:async()=>assert.fail('no work')},publication:null,storage});
 assert.deepEqual(await ops.preparePresentation(demandFor('a1400','image')),{status:'refused',code:'invalid-request'});
 assert.equal(validVisualDemand(demandFor('a1400','image')),true);
});
