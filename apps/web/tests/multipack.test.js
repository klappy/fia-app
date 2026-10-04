import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {validateRegistry,loadPresentation,hasUnresolvedInstructions} from '../src/lib/library.js';
const empty={status:'unavailable',count:0};
const pack={id:'spa.MRK-1-14-20',assets:{bible:{kind:'scripture',text:'Texto'}},sections:[{id:'S01'}],activities:[{id:'S01-U001',assetId:'bible',sectionId:'S01',completion:'confirm',sourceText:'Texto'}],listContracts:[],examples:[]};
const bytes=JSON.stringify(pack),hash=createHash('sha256').update(bytes).digest('hex');
const descriptor={id:pack.id,language:'spa',title:'Marcos',defaultScriptureId:'bible',revision:hash,presentation:{url:`/content/packs/${pack.id}/${hash}.json`,sha256:hash,bytes:Buffer.byteLength(bytes)},capabilities:{text:{available:true},guideNarration:empty,scriptureAudio:empty,resourceAudio:empty,generatedAudio:empty,images:empty,video:empty}};
test('selected payload is verified without fetching remote resources or other packs',async()=>{let calls=[];const prior=globalThis.fetch;globalThis.fetch=async url=>{calls.push(url);return new Response(bytes);};try{assert.equal((await loadPresentation(descriptor)).id,pack.id);assert.deepEqual(calls,[descriptor.presentation.url]);}finally{globalThis.fetch=prior;}});
test('registry rejects duplicate identity and payload loader rejects mismatched bytes',async()=>{assert.throws(()=>validateRegistry({schemaVersion:1,packs:[descriptor,descriptor]}),/invalid entry/);const prior=globalThis.fetch;globalThis.fetch=async()=>new Response(bytes+' ');try{await assert.rejects(loadPresentation(descriptor),/verified/);}finally{globalThis.fetch=prior;}});

test('approved immutable English presentation loads with its original @1 internal identity',async()=>{const {readFileSync}=await import('node:fs');const registry=JSON.parse(readFileSync('public/content/registry.json','utf8')),entry=registry.packs.find(p=>p.id==='eng.MRK-1-1-13');const original=readFileSync('public'+entry.presentation.url);const prior=globalThis.fetch;globalThis.fetch=async()=>new Response(original);try{assert.equal((await loadPresentation(entry)).id,'fia-mark-authentic@1');}finally{globalThis.fetch=prior;}});

test('provenance lineage is not an unresolved instruction',()=>{assert.equal(hasUnresolvedInstructions({diagnostics:[{code:'approved-presentation-lineage'}]}),false);assert.equal(hasUnresolvedInstructions({diagnostics:[{code:'unresolved-resource-link'}]}),true);});
