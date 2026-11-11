// No machine Spanish: captain (Klappy), 2026-11-04 3:07 PM ET, exception 3:08 PM ET (cookbook AGENTS.md § Hard rule).
// No machine translation and no machine-generated voice ships in any Spanish pack. The 3:08 exception is a captain-held
// toggle, default OFF, that may label machine text as such; nothing in the shipped data may use it. This test reads the
// compiled catalog the release ships (apps/web/public/content, the bytes the release closure pins) and fails on any
// Spanish unit, asset or recording whose provenance says a machine produced it, or whose provenance is missing where
// bytes are shipped. Cookbook work/queued/2026-11-04-fia-no-machine-translation-ai-voice-check (G23).
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync,readdirSync} from 'node:fs';
const root=new URL('../../apps/web/public/',import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const registry=read('content/registry.json'),spanish=registry.packs.filter(p=>p.language==='spa');
const SHIPPED=new Set(['source','generated','ready','packaged']);// a status that means bytes or text are present
// Every provenance-shaped object in a pack: {status, ai?, generator?, provenance?}.
function* provenanceObjects(value,path=''){
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){let i=0;for(const v of value)yield* provenanceObjects(v,`${path}[${i++}]`);return;}
 if('status' in value&&('ai' in value||'generator' in value||'provenance' in value))yield [path,value];
 for(const [k,v] of Object.entries(value))yield* provenanceObjects(v,path?`${path}.${k}`:k);
}
test('every Spanish pack ships human-sourced text and no machine voice or machine translation',()=>{
 assert.equal(spanish.length,165,'all Spanish Mark and Luke packs are checked');
 for(const d of spanish){
  const raw=readFileSync(new URL(d.presentation.url.slice(1),root),'utf8'),pack=JSON.parse(raw),where=d.id;
  // 1. The guide text is the published FIATranslationGuide source, never generated.
  assert.equal(pack.source.guide.provenance?.status,'source',where+': guide provenance');
  assert.equal(pack.source.guide.provenance?.collection,'FIATranslationGuide',where+': guide collection');
  assert.match(pack.source.guide.provenance?.revision||'',/^[a-f0-9]{40}$/,where+': guide revision');
  // 2. Nothing a machine produced ships: a slot a generator could fill (ai:true) must be absent or missing, never present.
  for(const [path,p] of provenanceObjects(pack.assets,'assets')){
   assert.notEqual(p.status,'generated',`${where} ${path}: generated content shipped`);
   if(p.ai===true||p.generator)assert.ok(!SHIPPED.has(p.status),`${where} ${path}: machine-produced ${p.generator||'content'} shipped as ${p.status}`);
   if(SHIPPED.has(p.status))assert.equal(p.provenance?.status,'source',`${where} ${path}: shipped without a published source`);
  }
  // 3. Recordings: no narration ships in a Spanish pack; a term recording comes from a published collection, never a generator.
  for(const a of pack.activities)assert.ok(!a.audioSrc&&!a.narrationAudio,where+' '+a.id+': narration audio in a Spanish pack');
  for(const a of Object.values(pack.assets)){
   assert.ok(!a.audioSrc&&!a.descriptionAudio,where+' '+a.id+': generated audio in a Spanish pack');
   if(a.remoteAudioSrc){const audio=a.sourceEvidence?.audio;assert.equal(audio?.status,'source',where+' '+a.id+': recording without source status');assert.equal(audio?.provenance?.status,'source',where+' '+a.id+': recording without published provenance');assert.ok(audio?.provenance?.collection,where+' '+a.id+': recording without a named collection');assert.notEqual(audio?.ai,true,where+' '+a.id+': machine voice');}
  }
  // 4. The machine-translation toggle is data-only and OFF: no pack carries machine-translated text or its label.
  assert.ok(!raw.includes('"machineTranslated"')&&!raw.includes('machine-translated'),where+': machine-translation plumbing in shipped data');
  for(const a of Object.values(pack.assets)){const state=a.spanishText;if(state!==undefined)assert.ok(['present','missing','english-fallback'].includes(state),where+' '+a.id+': '+state);}
  // 5. The catalog says so too: no generated or guide audio capability on a Spanish pack.
  assert.deepEqual(d.capabilities.generatedAudio,{status:'unavailable',count:0},where+': generatedAudio');
  assert.equal(d.capabilities.guideNarration.status,'unavailable',where+': guideNarration');
  // 6. No delivery sidecar supplies a Spanish recording from a generator.
  const dir=new URL(`content/delivery/${d.id}/`,root);
  if(existsSync(dir))for(const f of readdirSync(dir)){const sidecar=read(`content/delivery/${d.id}/${f}`);for(const e of sidecar.entries||[])assert.notEqual(e.recordingSource,'generated',where+' delivery '+e.path);}
 }
 // 7. The bundled generated recordings are the reviewed English Mark 1:1-13 adaptations only; none is Spanish.
 const manifest=read('content/source/audio-manifest.json');
 for(const e of manifest.entries)assert.doesNotMatch(e.path,/\/spa[./-]|\.spa\.|spanish|-es[./-]/i,'Spanish recording in the bundled audio manifest: '+e.path);
});
