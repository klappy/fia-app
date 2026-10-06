import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSpokenReference} from '../../server/fia/preparation/executor/spoken-reference.mjs';
import {sha256,canonicalJSONString} from '../../server/fia/preparation/contract.mjs';
const utf8=s=>new TextEncoder().encode(s);
async function fixture(script='Mark 1:14–20',speech='Mark chapter one verses fourteen through twenty',book='MRK'){
 const versification={revision:'fixture-reviewed-v1',books:{MRK:[45],JHN:[51],'1JN':[10],PSA:Array(150).fill(176)}};
 const words=speech.split(' ').map((word,i)=>({word,start:i*.2,end:i*.2+.15,probability:.8}));
 const recognitionBytes=utf8(JSON.stringify({words}));
 return {script,scriptSha256:await sha256(utf8(script)),recognitionBytes,recognitionSha256:await sha256(recognitionBytes),context:{kind:'bible-reference',language:'eng',book,scriptSpan:[0,script.length],wordSpan:[0,words.length]},versification,versificationSha256:await sha256(canonicalJSONString(versification))};
}
async function classify(script,speech,book){return (await compareSpokenReference(await fixture(script,speech,book))).classification;}

test('explicit markers/ranges preserve all raw words and no synthetic times',async()=>{
 const input=await fixture();const before=Buffer.from(input.recognitionBytes);const result=await compareSpokenReference(input);
 assert.equal(result.classification,'formatting-equivalent');assert.equal(result.grantsAcceptance,false);assert.equal(result.timingValidated,false);
 assert.deepEqual(result.reference,{book:'MRK',chapter:1,firstVerse:14,lastVerse:20});
 assert.deepEqual(result.trace.fields.chapter.words,[{wordIndex:2,word:'one',start:.4,end:.55}]);
 const represented=[...new Set([...Object.values(result.trace.fields).flatMap(f=>f.words.map(w=>w.wordIndex)),...result.trace.markers.map(w=>w.wordIndex)])].sort();
 assert.deepEqual(represented,[0,1,2,3,4,5,6]);assert.deepEqual(Buffer.from(input.recognitionBytes),before);
 for(const s of result.trace.separators){assert.equal('start' in s,false);assert.equal('end' in s,false);assert.equal(input.script.slice(...s.scriptSpan),s.scriptText);}
});
test('finite variants, cardinal and digit boundaries',async()=>{
 for(const speech of ['Mark one fourteen to twenty','Mark 1 : 14 – 20','Mark chapter one verse fourteen through twenty','Mk one verses fourteen to twenty'])assert.equal(await classify('Mark 1:14–20',speech),'formatting-equivalent');
 const r=await compareSpokenReference(await fixture('Mark 1:21','Mark one verse twenty one'));
 assert.equal(r.classification,'formatting-equivalent');assert.deepEqual(r.trace.fields.firstVerse.words.map(w=>w.wordIndex),[3,4]);
});
test('all numeric assignments counted before expected reference or versification',async()=>{
 assert.equal(await classify('Psalms 120:1','Psalms one hundred twenty one','PSA'),'recognition-ambiguity');
 assert.equal(await classify('Psalms 120:1','Psalms chapter one hundred twenty verse one','PSA'),'formatting-equivalent');
});
test('numeric book prefix is never discarded or guessed',async()=>{
 assert.equal(await classify('1 John 1:1','one John one verse one','1JN'),'formatting-equivalent');
 assert.notEqual(await classify('1 John 1:1','John one verse one','1JN'),'formatting-equivalent');
 assert.notEqual(await classify('John 1:1','two John one verse one','JHN'),'formatting-equivalent');
 assert.notEqual(await classify('1 John 1:1','first John one verse one','1JN'),'formatting-equivalent');
});
test('unsupported syntax and lexical changes cannot vanish',async()=>{
 for(const speech of ['Mark one fourteen twenty','Mark one fourteen and twenty','Mark one verse twenty to fourteen','Mark one verse fourteen to','Mark one verse -14','Mark one verse 14.0','Mark one verse ½','Mark one verse １４','Mark one verse −14','Mark one verse fourteen not twenty','Mark one verse fourteen no','Mark one verse fourteen never','Mark one verse fourteen without','Mark one verse fourteen hear','Mark one verse fourteen here','Mark one verse fourteen do','Mark one verse fourteen did','Mark one verse fourteen Mark one verse fourteen'])assert.notEqual(await classify('Mark 1:14',speech),'formatting-equivalent',speech);
 for(const script of ['Mark 1:14–2:1','Mark 1:14,20','Mark 1','Mark -1:14','Mark 1:0','Mark 1:14.0','Mark 1:14/20','Mark 1:46','Mark 1:20–14'])assert.notEqual(await classify(script,'Mark one fourteen'),'formatting-equivalent',script);
});
test('ordinary prose or untrusted span type cannot opt in',async()=>{
 const f=await fixture('There are one hundred twenty one','one hundred twenty one');f.context.kind='prose';await assert.rejects(compareSpokenReference(f),/trusted-context/);
 const label=await fixture('1.','number one');label.context.kind='numbered-label';await assert.rejects(compareSpokenReference(label),/trusted-context/);
 assert.equal(await classify('John 1:14','John one fourteen','MRK'),'unsupported');
 const carved=await fixture('xMark 1:14','Mark one fourteen');carved.context.scriptSpan[0]=1;await assert.rejects(compareSpokenReference(carved),/script-boundary/);
});
test('provided bytes, table and spans must bind; policy/table/context identity changes',async()=>{
 const f=await fixture();const a=await compareSpokenReference(f);
 for(const field of ['scriptSha256','recognitionSha256','versificationSha256'])await assert.rejects(compareSpokenReference({...f,[field]:'a'.repeat(64)}),/evidence-hash/);
 const v={...f.versification,revision:'fixture-reviewed-v2'};
 const b=await compareSpokenReference({...f,versification:v,versificationSha256:await sha256(canonicalJSONString(v))});
 assert.notEqual(a.pins.normalizationSha256,b.pins.normalizationSha256);assert.match(a.pins.bookTableSha256,/^[a-f0-9]{64}$/);assert.match(a.pins.numberTableSha256,/^[a-f0-9]{64}$/);
 for(const span of [[-1,2],[1,1],[0,100],[0,1.5]])await assert.rejects(compareSpokenReference({...f,context:{...f.context,wordSpan:span}}),/word-span/);
});
test('reversible offsets into larger script and raw word arrays',async()=>{
 const f=await fixture('Read Mark 1:14 now','Read Mark one verse fourteen now');f.context.scriptSpan=[5,14];f.context.wordSpan=[1,5];
 const r=await compareSpokenReference(f);assert.equal(r.classification,'formatting-equivalent');assert.deepEqual(r.trace.fields.book.scriptSpan,[5,9]);assert.equal(r.trace.fields.book.words[0].wordIndex,1);assert.equal(r.trace.fields.firstVerse.words[0].wordIndex,4);
});
test('invalid or nonmonotonic raw times fail before evidence',async()=>{
 for(const [field,value] of [['start',-1],['start',null],['end',-1],['end',null]]){
  const f=await fixture();const raw=JSON.parse(new TextDecoder().decode(f.recognitionBytes));raw.words[2][field]=value;
  f.recognitionBytes=utf8(JSON.stringify(raw));f.recognitionSha256=await sha256(f.recognitionBytes);await assert.rejects(compareSpokenReference(f),/word-evidence/);
 }
 const f=await fixture();const raw=JSON.parse(new TextDecoder().decode(f.recognitionBytes));raw.words[2].end=5;
 f.recognitionBytes=utf8(JSON.stringify(raw));f.recognitionSha256=await sha256(f.recognitionBytes);await assert.rejects(compareSpokenReference(f),/word-evidence/);
});
