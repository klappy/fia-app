import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBlocks,localReader,cutKey} from '../../scripts/clip-text/blocks.mjs';
import {opcodes,classify,judge,normalize} from '../../scripts/clip-text/compare.mjs';
import {runCheck,HEARD} from '../../scripts/clip-text/check.mjs';

const root=new URL('../../',import.meta.url).pathname;
const media={sha256:'a'.repeat(64),ext:'ogg'};
const block=(displayed,range=[54.32,57.64])=>({id:'eng.MRK-1-1-13/S01-U008',cls:'guide-range',displayed,media,range});
const loud={start:-14,end:-13},quiet={start:-80,end:-80};
const cuts=(...entries)=>({cuts:Object.fromEntries(entries)});

test('the diff is difflib SequenceMatcher (autojunk off), so edge labels match the audit tool',()=>{
 assert.deepEqual(opcodes('a b c d'.split(' '),'x a b d e'.split(' ')),[['insert',0,0,0,1],['equal',0,2,1,3],['delete',2,3,3,3],['equal',3,4,3,4],['insert',4,4,4,5]]);
 assert.deepEqual(opcodes('the cat sat on the mat'.split(' '),'the mat sat on the cat'.split(' ')),[['equal',0,1,0,1],['replace',1,2,1,2],['equal',2,5,2,5],['replace',5,6,5,6]]);
});

test('captain report S01-U008: a leading "6" and a cut-off ending fail the block',()=>{
 const b=block('Who do you know who needs to hear this passage?');
 const r=judge(b,{text:'Six. Who do you know who needs to',edge:loud});
 assert.equal(r.verdict,'TRUNCATED_END');
 assert.deepEqual(r.flags,['TRUNCATED_END','LEADING_EXTRA']);
 assert.deepEqual(r.lead,['6']);assert.deepEqual(r.missingEnd,['hear','this','passage']);
 assert.equal(judge(b,{text:'Who do you know who needs to hear this passage?',edge:loud}).verdict,'MATCH');
});

test('every block needs a transcript of exactly its cut: a moved boundary or replaced file fails until re-transcribed',()=>{
 const b=block('Who do you know who needs to hear this passage?');
 const heard=cuts([cutKey(media,[54.32,57.64]),{text:'Who do you know who needs to hear this passage?',edge:loud}]);
 assert.equal(runCheck({blocks:[b],heard}).ok,true);
 const moved=runCheck({blocks:[block(b.displayed,[53.1,57.64])],heard});
 assert.equal(moved.ok,false);assert.equal(moved.failures[0].result.verdict,'NOT_TRANSCRIBED');assert.equal(moved.stale.length,1);
 const replaced=runCheck({blocks:[{...b,media:{...media,sha256:'b'.repeat(64)}}],heard});
 assert.equal(replaced.failures[0].result.verdict,'NOT_TRANSCRIBED');
});

test('screen wording that the recording never says fails as WRONG, not as a pass',()=>{
 const b=block('I will pause the audio here while you act out the passage.',[67.25,71.45]);
 const r=judge(b,{text:'Pause this audio here and act out the passage.',edge:loud,context:{text:'drama. Pause this audio here and act out the passage. Now',words:[]}});
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

test('the stored transcripts cover exactly the blocks the bundled content plays',()=>{
 const {blocks}=buildBlocks(localReader(root)),heard=JSON.parse(readFileSync(HEARD));
 const result=runCheck({blocks,heard});
 assert.ok(blocks.length>=302);
 assert.deepEqual(result.rows.filter(x=>x.result.verdict==='NOT_TRANSCRIBED').map(x=>x.block.id),[]);
 assert.deepEqual(result.stale,[]);
 assert.equal(heard.method.recognizer,'faster-whisper');
});
