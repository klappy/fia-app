import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCanonicalUnitLedgerResolver,P1_CANONICAL_LEDGER_PINS as pins} from '../../server/fia/preparation/executor/canonical-unit-ledger.mjs';
const paths={ledgerBytes:'server/fia/preparation/executor/p1-canonical-unit-ledger.json',sourcePackBytes:'server/fia/compiler/presentation/source-packs.json.gz',presentationBytes:'server/fia/publication/approved-presentation.json',bundleBytes:'apps/web/public/content/bundle.json'};
const load=async()=>Object.fromEntries(await Promise.all(Object.entries(paths).map(async([k,p])=>[k,await readFile(new URL('../../'+p,import.meta.url))])));
const selection=sectionId=>({packId:'eng.MRK-1-1-13',sectionId,presentationSha256:pins.presentation});
test('entire actual P1 corpus joins exact source, approved presentation and bundle',async()=>{
 const resolve=await createCanonicalUnitLedgerResolver(await load()),rows=Array.from({length:6},(_,i)=>resolve(selection('S0'+(i+1))).units).flat();
 assert.equal(rows.length,130);assert.equal(new Set(rows.map(u=>u.sourceUnitId)).size,130);
 assert.deepEqual(rows.reduce((a,u)=>(a[u.disposition]=(a[u.disposition]||0)+1,a),{}),{default:111,'source-detail':4,'optional-example':13,'production-request':2});
 const hidden=rows.filter(u=>['source-detail','production-request'].includes(u.disposition));
 assert.deepEqual(hidden.map(u=>[u.sourceUnitId,u.associatedActivityId]),[['S02-U012','S02-U011'],['S05-U044','S05-U043'],['S05-U045','S05-U043'],['S06-U005','S06-U004'],['S06-U007','S06-U006'],['S06-U009','S06-U008']]);
 assert(hidden.every(u=>u.activityIds.length===0));assert.equal(resolve(selection('S05')).grantsPlaybackAcceptance,false);
 const copy=resolve(selection('S02'));copy.units[0].text='tamper';assert.notEqual(resolve(selection('S02')).units[0].text,'tamper');
});
for(const [name,change] of Object.entries({missing:l=>l.units.pop(),duplicate:l=>l.units.push(l.units[0]),text:l=>l.units[0].text+='x',association:l=>l.units.find(u=>u.disposition==='production-request').associatedActivityId='S01-U001',disposition:l=>l.units.find(u=>u.disposition==='production-request').disposition='default'}))test('reject '+name+' ledger mutation',async()=>{const args=await load(),l=JSON.parse(args.ledgerBytes);change(l);args.ledgerBytes=new TextEncoder().encode(JSON.stringify(l));await assert.rejects(createCanonicalUnitLedgerResolver(args),/ledger-hash/);});
for(const key of ['sourcePackBytes','presentationBytes','bundleBytes'])test('reject changed '+key,async()=>{const args=await load();args[key][0]^=1;await assert.rejects(createCanonicalUnitLedgerResolver(args),/hash/);});
test('P1-only and exact presentation revision authority',async()=>{const r=await createCanonicalUnitLedgerResolver(await load());assert.throws(()=>r({...selection('S01'),packId:'eng.MRK-1-14-20'}),/selection/);assert.throws(()=>r({...selection('S01'),presentationSha256:'f'.repeat(64)}),/revision/);assert.throws(()=>r(selection('S99')),/selection/);});

test('Buffer inputs are captured synchronously before asynchronous hashing',async()=>{
 const args=await load();assert(Buffer.isBuffer(args.ledgerBytes));
 const pending=createCanonicalUnitLedgerResolver(args);
 const injected=JSON.parse(args.ledgerBytes);injected.units[0].acceptedPlaybackRanges=[{start:1,end:2}];
 const compact=JSON.stringify(injected);assert(Buffer.byteLength(compact)<args.ledgerBytes.length);
 args.ledgerBytes.fill(32);args.ledgerBytes.write(compact);
 // All other input buffers must also be isolated before the first await.
 args.sourcePackBytes.fill(0);args.presentationBytes.fill(0);args.bundleBytes.fill(0);
 const resolve=await pending,result=resolve(selection('S01'));
 assert.equal(result.units.length,8);assert(!('acceptedPlaybackRanges' in result.units[0]));
 assert.equal(result.ledgerSha256,pins.ledger);
});
