#!/usr/bin/env node
// Clip-vs-text gate. For every block the app plays (each screen's start/stop
// window into a delivered recording, or a whole pre-cut file), the words heard
// in exactly that cut must equal the words that screen displays. Mismatch = fail.
//
// The heard words come from a transcription of exactly that cut
// (scripts/clip-text/transcribe.py), stored in tests/release/clip-text-heard.json
// keyed by delivered-media sha256 + window. CI has no ASR, so it judges the
// stored transcripts; any block whose cut was never transcribed (a moved
// boundary, a replaced file, a new screen) fails until it is.
//
// Reviewed mismatches (tests/release/clip-text-reviewed.json) are reported on
// every run but do not fail it. Each entry names one block, its exact cut key,
// the exact screen text and the exact heard text, and a class:
//   recognizer-miss  the audio is right; a second recognizer's transcript of the
//                    same cut is stored in the entry and must MATCH the screen
//                    under these same rules, or the entry is refused;
//   pending-ruling   a real or unresolved difference held for the captain's
//                    ruling, with the defect named.
// Any new block, moved boundary, replaced file, changed screen text or changed
// transcript no longer matches its entry and fails; an entry that matches no
// failing block is stale and fails. Red always means an unreviewed mismatch.
//
// usage: node scripts/clip-text/check.mjs [--origin https://dev.fiaguide.app]
//          [--heard tests/release/clip-text-heard.json] [--reviewed tests/release/clip-text-reviewed.json]
//          [--md out.md] [--json out.json]
//          [--emit-blocks blocks.json] [--only <regex>]
//   --origin  judge what an environment serves: every content file the block
//             list is built from must be byte-identical to the bundled copy,
//             and the served bytes are then judged the same way.
//   --identity-only  with --origin: stop after the byte-identity proof (the
//             post-deploy step; the words themselves are judged in CI).
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {buildBlocks,localReader,cutKey} from './blocks.mjs';
import {judge,diffText,classify,normalize,AUDIBLE_CUT,LOUD_DB} from './compare.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const HEARD=resolve(ROOT,'tests/release/clip-text-heard.json');
export const REVIEWED=resolve(ROOT,'tests/release/clip-text-reviewed.json');
const sha256=b=>createHash('sha256').update(b).digest('hex');
export const CLASSES=['recognizer-miss','pending-ruling'];

// Why a reviewed entry may not excuse this failing row, or null if it may.
export function refuseEntry(entry,{block,result},heardEntry){
 if(!CLASSES.includes(entry.class))return `unknown class "${entry.class}"`;
 if(typeof entry.reason!=='string'||!entry.reason.trim())return 'no reason';
 if(entry.class==='pending-ruling'&&!entry.defect)return 'pending-ruling without a named defect';
 if(entry.class==='recognizer-miss'){
  const ev=entry.evidence;
  if(!ev||typeof ev.model!=='string'||typeof ev.text!=='string')return 'recognizer-miss without a second recognizer transcript';
  const second=judge(block,{...heardEntry,text:ev.text});
  if(second.verdict!=='MATCH')return `the second recognizer (${ev.model}) does not match the screen either (${second.verdict})`;
 }
 return null;
}

export function runCheck({blocks,heard,reviewed,only}){
 const cuts=heard?.cuts||{},used=new Set(),rows=[];
 for(const b of blocks){
  if(only&&!new RegExp(only).test(b.id))continue;
  const key=cutKey(b.media,b.range);used.add(key);
  const r=judge(b,cuts[key]);
  if(r.heard!==undefined&&b.script&&normalize(b.script).join(' ')!==normalize(b.displayed).join(' '))r.scriptVerdict=classify(b.script,r.heard).verdict;
  rows.push({block:b,key,result:r});
 }
 const stale=only?[]:Object.keys(cuts).filter(k=>!used.has(k));
 const entries=reviewed?.entries||[],usedEntries=new Set(),refused=[];
 for(const row of rows){
  if(row.result.verdict==='MATCH'||row.result.verdict==='NOT_TRANSCRIBED')continue;
  const i=entries.findIndex(e=>e.block===row.block.id&&e.key===row.key&&e.displayed===row.block.displayed&&e.heard===row.result.heard);
  if(i<0)continue;
  usedEntries.add(i);
  const why=refuseEntry(entries[i],row,cuts[row.key]);
  if(why){refused.push({entry:entries[i],why});row.result.notes.push(`reviewed entry refused: ${why}`);continue;}
  row.reviewed=entries[i];
 }
 const staleReviewed=only?[]:entries.filter((_,i)=>!usedEntries.has(i));
 const failures=rows.filter(x=>x.result.verdict!=='MATCH'&&!x.reviewed),held=rows.filter(x=>x.reviewed);
 return {rows,failures,held,stale,staleReviewed,refused,ok:!failures.length&&!stale.length&&!staleReviewed.length};
}

const md=s=>String(s??'').replaceAll('|','\\|').replaceAll('\n',' / ');
const rng=b=>b.range?`${b.range[0]}–${b.range[1]}`:'whole';
const VERDICTS=['MATCH','SOURCE_ID','TRUNCATED_END','TRUNCATED_START','LEADING_EXTRA','TRAILING_EXTRA','CUT_IN_SOUND','WRONG','NOT_TRANSCRIBED'];
// Timing next to the words: lead-in/lead-out (silence inside the cut before the
// first and after the last sound) and edges that sit in breath or murmur.
export const LONG_TAIL=1,MURMUR_DB=-50;
function timing(rows,cuts){
 const xs=rows.filter(x=>x.block.range&&AUDIBLE_CUT.has(x.block.cls)&&cuts[x.key]?.edge);
 const e=x=>cuts[x.key].edge,flag=x=>{const g=e(x),f=[];
  if(g.leadIn>LONG_TAIL)f.push(`lead-in ${g.leadIn} s`);if(g.leadOut>LONG_TAIL)f.push(`lead-out ${g.leadOut} s`);
  for(const s of ['start','end'])if(g[s]>MURMUR_DB)f.push(`${s} edge ${g[s]} dBFS${g[s]>LOUD_DB?' (in sound: fails)':' (breath or murmur)'}`);return f;};
 const over=t=>xs.filter(x=>e(x).leadOut>t).length,marked=xs.map(x=>[x,flag(x)]).filter(([,f])=>f.length);
 const L=['','## Timing (guide, prepared and Scripture range windows)','',
  `${xs.length} windows. Lead-out over 0.25 s: ${over(0.25)}; over ${LONG_TAIL} s: ${over(LONG_TAIL)}. Edges louder than ${MURMUR_DB} dBFS: ${xs.filter(x=>e(x).start>MURMUR_DB||e(x).end>MURMUR_DB).length} (over ${LOUD_DB} dBFS fails as CUT_IN_SOUND: ${xs.filter(x=>e(x).start>LOUD_DB||e(x).end>LOUD_DB).length}).`];
 if(marked.length){L.push('','| block | window s | lead-in s | lead-out s | start / end 50 ms dBFS | why listed |','|---|---|---|---|---|---|');
  for(const [x,f] of marked){const g=e(x);L.push(`| ${x.block.id} | ${rng(x.block)} | ${g.leadIn} | ${g.leadOut} | ${g.start} / ${g.end} | ${f.join('; ')} |`);}}
 return L;
}
export function report({rows,failures,held=[],stale,staleReviewed=[],refused=[]},title,cuts={}){
 const classes=[...new Set(rows.map(x=>x.block.cls))];
 const pending=held.filter(x=>x.reviewed.class==='pending-ruling'),misses=held.filter(x=>x.reviewed.class==='recognizer-miss');
 const L=[`# ${title}`,'',`${rows.length} blocks: ${rows.length-failures.length-held.length} match, ${failures.length} fail unreviewed, ${pending.length} held for a ruling, ${misses.length} recognizer misses verified by a second recognizer${stale.length?`, ${stale.length} stale transcripts`:''}${staleReviewed.length?`, ${staleReviewed.length} stale reviewed entries`:''}.`,'',
  '| block class | '+VERDICTS.join(' | ')+' | of which reviewed | total |','|---|'+'---|'.repeat(VERDICTS.length+2)];
 for(const c of classes){const xs=rows.filter(x=>x.block.cls===c);L.push(`| ${c} | `+VERDICTS.map(v=>xs.filter(x=>x.result.verdict===v).length).join(' | ')+` | ${xs.filter(x=>x.reviewed).length} | ${xs.length} |`);}
 const table=(head,list,extra)=>{if(!list.length)return;L.push('',head,'',`| block | window s | verdict |${extra?` ${extra[0]} |`:''} heard matches the recorded script? | diff | displayed | heard |`,'|---|---|---|'+(extra?'---|':'')+'---|---|---|---|');
  for(const x of list){const {block:b,result:r}=x;L.push(`| ${b.id} | ${rng(b)} | ${r.verdict} |${extra?` ${md(extra[1](x))} |`:''} ${r.scriptVerdict??'-'} | ${md([diffText(r),...r.notes].filter(Boolean).join('; '))} | ${md(b.displayed)} | ${md(r.heard??'')} |`);}};
 table('## Failures (unreviewed: these fail the check)',failures);
 table('## Held for the captain\'s ruling (reviewed, reported, not failing)',pending,['defect: reason',x=>`${x.reviewed.defect}: ${x.reviewed.reason}`]);
 table('## Recognizer misses (reviewed: a second recognizer hears the screen\'s words on the same cut)',misses,['second recognizer',x=>`${x.reviewed.evidence.model}: "${x.reviewed.evidence.text}" — ${x.reviewed.reason}`]);
 if(refused.length)L.push('','## Refused reviewed entries (fail)','',...refused.map(({entry,why})=>`- ${entry.block} (${entry.class}): ${why}`));
 if(staleReviewed.length)L.push('','## Stale reviewed entries (match no failing block: remove them; fail)','',...staleReviewed.map(e=>`- ${e.block} ${e.key} (${e.class})`));
 if(stale.length)L.push('','## Stale transcripts (no block cuts these any more)','',...stale.map(k=>`- ${k}`));
 L.push(...timing(rows,cuts));
 return L.join('\n')+'\n';
}

async function originReader(origin,local){
 // Served content must be the bundled content, byte for byte, before the
 // bundled transcripts may vouch for it.
 const cache=new Map();
 const fetchBytes=async path=>{const r=await fetch(new URL(path,origin),{headers:{'cache-control':'no-cache'}});if(!r.ok)throw Error(`${path}: HTTP ${r.status} from ${origin}`);return Buffer.from(await r.arrayBuffer());};
 const {read}=buildBlocks(local);
 const drift=[];
 for(const path of read){const served=await fetchBytes(path);cache.set(path,served);if(sha256(served)!==sha256(local.bytes(path)))drift.push(path);}
 return {drift,reader:{bytes:path=>{if(!cache.has(path))throw Error(`${path} not prefetched`);return cache.get(path);},list:dir=>local.list(dir)}};
}

async function main(argv){
 const arg=name=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:undefined;};
 const local=localReader(ROOT);let reader=local,title='Clip-vs-text check: bundled content';
 if(arg('--origin')){
  const {drift,reader:served}=await originReader(arg('--origin'),local);
  if(drift.length){console.error(`served content differs from the bundled content the transcripts cover:\n${drift.join('\n')}`);return 1;}
  reader=served;title=`Clip-vs-text check: ${arg('--origin')}`;
  if(argv.includes('--identity-only')){console.log(`clip-text: served content is byte-identical to the bundled content (${buildBlocks(served).blocks.length} blocks); the CI words check covers it.`);return 0;}
 }
 const {blocks}=buildBlocks(reader);
 if(arg('--emit-blocks')){writeFileSync(arg('--emit-blocks'),JSON.stringify({blocks},null,1)+'\n');console.log(`${blocks.length} blocks -> ${arg('--emit-blocks')}`);return 0;}
 const heard=JSON.parse(readFileSync(arg('--heard')||HEARD));
 const reviewed=JSON.parse(readFileSync(arg('--reviewed')||REVIEWED));
 const result=runCheck({blocks,heard,reviewed,only:arg('--only')});
 const text=report(result,title,heard.cuts);
 if(arg('--md'))writeFileSync(arg('--md'),text);
 if(arg('--json'))writeFileSync(arg('--json'),JSON.stringify(result.rows.map(({block:b,key,result:r,reviewed:rv})=>({id:b.id,cls:b.cls,range:b.range,key,verdict:r.verdict,flags:r.flags,diff:diffText(r),notes:r.notes,displayed:b.displayed,heard:r.heard??null,scriptVerdict:r.scriptVerdict??null,edge:heard.cuts[key]?.edge??null,reviewed:rv?{class:rv.class,defect:rv.defect??null}:null})),null,1)+'\n');
 console.log(text);
 const tail=[result.stale.length&&`${result.stale.length} stale transcripts`,result.staleReviewed.length&&`${result.staleReviewed.length} stale reviewed entries`,result.held.length&&`${result.held.length} reviewed mismatches reported (not failing)`].filter(Boolean).join('; ');
 if(!result.ok)console.error(`clip-text: FAIL — ${result.failures.length} of ${result.rows.length} blocks: the words heard in the cut differ from the words on the screen, unreviewed${tail?`; ${tail}`:''}.`);
 else console.log(`clip-text: PASS — ${result.rows.length} blocks: no unreviewed mismatch${tail?`; ${tail}`:''}.`);
 return result.ok?0:1;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main(process.argv.slice(2));
