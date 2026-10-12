import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBlocks,localReader,cutKey} from '../../scripts/clip-text/blocks.mjs';
import {opcodes,classify,judge,normalize} from '../../scripts/clip-text/compare.mjs';
import * as checkModule from '../../scripts/clip-text/check.mjs';
const {runCheck,report,HEARD,REVIEWED,CLASSES}=checkModule;

const root=new URL('../../',import.meta.url).pathname;
const media={sha256:'a'.repeat(64),ext:'ogg'};
const block=(displayed,range=[54.32,57.64])=>({id:'eng.MRK-1-1-13/S01-U008',cls:'guide-range',displayed,media,range});
// clean: the real S01-U008 window's edges (silence on both sides); loud: speech at both edges.
const loud={start:-14,end:-13},quiet={start:-80,end:-80},clean={start:-78,end:-66};
const cuts=(...entries)=>({cuts:Object.fromEntries(entries)});

test('the diff is difflib SequenceMatcher (autojunk off), so edge labels match the audit tool',()=>{
 assert.deepEqual(opcodes('a b c d'.split(' '),'x a b d e'.split(' ')),[['insert',0,0,0,1],['equal',0,2,1,3],['delete',2,3,3,3],['equal',3,4,3,4],['insert',4,4,4,5]]);
 assert.deepEqual(opcodes('the cat sat on the mat'.split(' '),'the mat sat on the cat'.split(' ')),[['equal',0,1,0,1],['replace',1,2,1,2],['equal',2,5,2,5],['replace',5,6,5,6]]);
});

test('captain report S01-U008: a leading "6" and a cut-off ending fail the block',()=>{
 const b=block('Who do you know who needs to hear this passage?');
 // what he heard: the window shifted early, opening in "6." and stopping inside "hear"
 const r=judge(b,{text:'Six. Who do you know who needs to',edge:loud});
 assert.equal(r.verdict,'TRUNCATED_END');
 assert.deepEqual(r.flags,['TRUNCATED_END','LEADING_EXTRA','CUT_IN_SOUND']);
 assert.deepEqual(r.lead,['6']);assert.deepEqual(r.missingEnd,['hear','this','passage']);
 assert.equal(judge(b,{text:'Who do you know who needs to hear this passage?',edge:clean}).verdict,'MATCH');
});

test('every block needs a transcript of exactly its cut: a moved boundary or replaced file fails until re-transcribed',()=>{
 const b=block('Who do you know who needs to hear this passage?');
 const heard=cuts([cutKey(media,[54.32,57.64]),{text:'Who do you know who needs to hear this passage?',edge:clean}]);
 assert.equal(runCheck({blocks:[b],heard}).ok,true);
 const moved=runCheck({blocks:[block(b.displayed,[53.1,57.64])],heard});
 assert.equal(moved.ok,false);assert.equal(moved.failures[0].result.verdict,'NOT_TRANSCRIBED');assert.equal(moved.stale.length,1);
 const replaced=runCheck({blocks:[{...b,media:{...media,sha256:'b'.repeat(64)}}],heard});
 assert.equal(replaced.failures[0].result.verdict,'NOT_TRANSCRIBED');
});

test('screen wording that the recording never says fails as WRONG, not as a pass',()=>{
 const b=block('I will pause the audio here while you act out the passage.',[67.25,71.45]);
 const r=judge(b,{text:'Pause this audio here and act out the passage.',edge:clean,context:{text:'drama. Pause this audio here and act out the passage. Now',words:[]}});
 assert.equal(r.verdict,'WRONG');assert.match(r.notes.join(' '),/never says "i will"/);
});

test('a missing edge word that the widened window says outside the cut is a confirmed truncation',()=>{
 const b={...block('A voice of one calling in the wilderness',[17.24,23.66]),cls:'scripture-verse'};
 const words=[['A',17.02,17.2],[' voice',17.36,17.6],[' of',17.6,17.8],[' one',17.8,18.08],[' calling',18.08,18.46]];
 const r=judge(b,{text:'voice of one calling in the wilderness',edge:loud,context:{text:'A voice of one calling in the wilderness',words}});
 assert.equal(r.verdict,'TRUNCATED_START');assert.match(r.notes.join(' '),/confirmed/);
});

test('ASR filler on a silent edge is not audio; the same word on a loud edge fails',()=>{
 const b=block('Who do you know who needs to hear this passage?');
 assert.equal(judge(b,{text:'Who do you know who needs to hear this passage? Thank you.',edge:quiet}).verdict,'MATCH');
 assert.equal(judge(b,{text:'Who do you know who needs to hear this passage? Thank you.',edge:loud}).verdict,'TRAILING_EXTRA');
 assert.equal(judge(b,{text:'Who do you know who needs to hear this passage? Six.',edge:quiet}).verdict,'TRAILING_EXTRA');
});

test('an "and" the recognizer adds only between two displayed sentences is ignored; anywhere else it fails',()=>{
 assert.equal(classify('A prophet gives messages. This message is hard.','A prophet gives messages, and this message is hard.').verdict,'MATCH');
 assert.equal(classify('A prophet gives messages to people.','A prophet gives and messages to people.').verdict,'WRONG');
 assert.equal(classify('A prophet gives messages. This message is hard.','And a prophet gives messages. This message is hard.').verdict,'LEADING_EXTRA');
});

test('normalization: numbers, chapter/verse labels and spelling only',()=>{
 assert.deepEqual(normalize('Mark 1:1–13',true),['mark','1','1','13']);
 assert.deepEqual(normalize('Mark chapter one verses one through thirteen',true),['mark','1','1','13']);
 assert.deepEqual(normalize('Six.',true),['6']);
 assert.notDeepEqual(normalize('I will pause the audio here'),normalize('Pause this audio here'));
});

test('a reviewed mismatch is reported, not failed; a new or changed one fails; a stale entry fails',()=>{
 const b=block('I will pause the audio here while you act out the passage.',[67.25,71.45]),key=cutKey(media,b.range);
 const said='Pause this audio here and act out the passage.';
 const heard=cuts([key,{text:said,edge:quiet}]);
 const entry={block:b.id,key,displayed:b.displayed,heard:said,class:'pending-ruling',defect:'wording',reason:'screen says "I will pause the audio"; recording says "Pause this audio"'};
 const held=runCheck({blocks:[b],heard,reviewed:{entries:[entry]}});
 assert.equal(held.ok,true);assert.equal(held.failures.length,0);assert.equal(held.held.length,1);
 assert.match(report(held,'t',heard.cuts),/Held for the captain's ruling[\s\S]*wording: screen says/);
 assert.equal(runCheck({blocks:[b],heard}).ok,false);
 // the same entry no longer excuses a changed transcript, screen text or boundary
 assert.equal(runCheck({blocks:[b],heard:cuts([key,{text:said+' Now.',edge:quiet}]),reviewed:{entries:[entry]}}).failures.length,1);
 const edited=runCheck({blocks:[{...b,displayed:'Pause the audio here while you act out the passage.'}],heard,reviewed:{entries:[entry]}});
 assert.equal(edited.ok,false);assert.equal(edited.failures.length,1);assert.equal(edited.staleReviewed.length,1);
 const moved=runCheck({blocks:[{...b,range:[67.25,71.9]}],heard:cuts([cutKey(media,[67.25,71.9]),{text:said,edge:quiet}]),reviewed:{entries:[entry]}});
 assert.equal(moved.ok,false);assert.equal(moved.staleReviewed.length,1);
 // an entry with no failing block behind it is stale and fails
 const ok=block('Who do you know who needs to hear this passage?');
 assert.equal(runCheck({blocks:[ok],heard:cuts([cutKey(media,ok.range),{text:ok.displayed,edge:quiet}]),reviewed:{entries:[{...entry,block:ok.id,key:cutKey(media,ok.range)}]}}).ok,false);
 assert.deepEqual(CLASSES,['recognizer-miss','pending-ruling']);
});

test('a recognizer-miss entry must carry a second transcript of the same cut that matches the screen',()=>{
 const b={...block('A king is someone who rules over a city.'),id:'eng.MRK-1-1-13/term-x',cls:'term-whole',range:null},key=cutKey(media,null);
 const heard=cuts([key,{text:'A king is someone who rolls over a city.',edge:quiet}]);
 const base={block:b.id,key,displayed:b.displayed,heard:'A king is someone who rolls over a city.',class:'recognizer-miss',reason:'rules/rolls'};
 const good=runCheck({blocks:[b],heard,reviewed:{entries:[{...base,evidence:{model:'medium.en',text:'A king is someone who rules over a city.'}}]}});
 assert.equal(good.ok,true);assert.equal(good.held[0].reviewed.class,'recognizer-miss');
 for(const entry of [base,{...base,evidence:{model:'medium.en',text:'A king is someone who rolls over a city.'}},{...base,class:'looks-fine'},{...base,class:'pending-ruling'}]){
  const r=runCheck({blocks:[b],heard,reviewed:{entries:[entry]}});
  assert.equal(r.ok,false,JSON.stringify(entry));assert.equal(r.refused.length,1);
 }
});

test('a word timed before the cut, or a cut that opens inside sound, is a timing cut, not a recognizer miss',()=>{
 // unfoldingWord Literal v3: "a" is said 10.69-10.81 s, the highlight opens at 10.772 s.
 const v3={id:'eng.MRK-1-1-13/scripture-unfoldingWordLiteral#v3',cls:'scripture-verse',media,range:[10.772,16.411],displayed:'a voice of one calling out in the wilderness'};
 const words=[[' way,',9.892,10.232],[' a',10.692,10.812],[' voice',10.812,11.032],[' of',11.032,11.232],[' one',11.232,11.4],[' calling',11.4,11.8]];
 const context={text:'way, a voice of one calling out in the wilderness',words};
 const late=judge(v3,{text:'voice of one calling out in the wilderness',edge:{start:-30.5,end:-80},context});
 assert.equal(late.verdict,'TRUNCATED_START');assert.match(late.notes.join(' '),/ambiguous, counted as timing/);
 // the same miss with the word timed inside the cut and a quiet edge is a short-crop recognizer miss
 const inside=judge({...v3,range:[10.6,16.411]},{text:'voice of one calling out in the wilderness',edge:{start:-60,end:-80},context});
 assert.equal(inside.verdict,'WRONG');assert.match(inside.notes.join(' '),/inside the cut at 10.6s and the edge is quiet/);
 // timed inside, but the cut opens in sound: still counted as timing
 assert.equal(judge({...v3,range:[10.6,16.411]},{text:'voice of one calling out in the wilderness',edge:{start:-25,end:-80},context}).verdict,'TRUNCATED_START');
});

test('a source id on screen or in the audio fails even when both sides say it',()=>{
 const t={id:'eng.MRK-1-1-13/term-eng-t226-v2',cls:'term-whole',media,range:null,displayed:'t226 king\n\nA king is someone who rules.'};
 const r=judge(t,{text:'T226 king. A king is someone who rules.',edge:quiet});
 assert.equal(r.verdict,'SOURCE_ID');assert.ok(r.flags.includes('SOURCE_ID'));
 assert.equal(judge({...t,displayed:'king\n\nA king is someone who rules.'},{text:'T226 king. A king is someone who rules.',edge:quiet}).flags.includes('SOURCE_ID'),true);
 assert.equal(judge({...t,displayed:'king'},{text:'king',edge:quiet}).verdict,'MATCH');
});

test('an audible window that opens or closes inside a sound fails even when the words match; a verse highlight does not',()=>{
 const b=block('Who do you know who needs to hear this passage?');
 const r=judge(b,{text:b.displayed,edge:{start:-20,end:-80}});
 assert.equal(r.verdict,'CUT_IN_SOUND');assert.match(r.notes.join(' '),/opens inside sound/);
 assert.equal(judge(b,{text:b.displayed,edge:{start:-40,end:-80}}).verdict,'MATCH');
 assert.equal(judge({...b,cls:'scripture-verse'},{text:b.displayed,edge:{start:-20,end:-80}}).verdict,'MATCH');
});

test('pack-alignment verse windows use the delivered clock: media = logical x scale + offset',()=>{
 const files={
  '/content/packs/eng.X/pack.json':{activities:[],assets:{'scripture-S':{verses:[{text:'1 a b'}],alignment:{verses:[{verse:1,start:1.5,end:2.25,text:'1 a b'}]}}}},
  '/content/delivery/eng.X.json':{packId:'eng.X',entries:[{path:'/audio/source/scripture-S.mp3',delivery:{kind:'audio',url:'https://x/s.mp3',sha256:'c'.repeat(64),bytes:1,mime:'audio/mpeg'},timing:{mapping:{offsetSeconds:0.5,scale:2}}}]},
 };
 const reader={bytes:p=>Buffer.from(JSON.stringify(files[p])),list:dir=>Object.keys(files).filter(p=>p.startsWith(dir+'/')).sort()};
 const verse=buildBlocks(reader).blocks.find(x=>x.cls==='scripture-verse');
 assert.deepEqual(verse.range,[3.5,5]);
 files['/content/delivery/eng.X.json'].entries[0].timing.mapping.scale=0;
 assert.throws(()=>buildBlocks(reader),/scale/);
});

test('the stored transcripts cover exactly the blocks the bundled content plays, reproducibly, and every reviewed entry holds',()=>{
 const {blocks}=buildBlocks(localReader(root)),heard=JSON.parse(readFileSync(HEARD)),reviewed=JSON.parse(readFileSync(REVIEWED));
 const result=runCheck({blocks,heard,reviewed});
 assert.ok(blocks.length>=302);
 assert.deepEqual(result.rows.filter(x=>x.result.verdict==='NOT_TRANSCRIBED').map(x=>x.block.id),[]);
 assert.deepEqual(result.stale,[]);
 assert.deepEqual(result.refused.map(x=>`${x.entry.block}: ${x.why}`),[]);
 assert.deepEqual(result.staleReviewed.map(x=>x.block),[]);
 assert.equal(heard.method.recognizer,'faster-whisper');
 // temperature 0 with no sampling fallback and no hand chunking: a rerun hears the same words
 assert.equal(heard.method.temperature,0);assert.match(heard.method.chunking,/^none/);
 for(const [k,c] of Object.entries(heard.cuts))assert.ok(Number.isFinite(c.edge?.start)&&'leadIn' in c.edge&&'leadOut' in c.edge,k);
});
