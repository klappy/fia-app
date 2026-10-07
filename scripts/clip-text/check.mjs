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
// usage: node scripts/clip-text/check.mjs [--origin https://dev.fiaguide.app]
//          [--heard tests/release/clip-text-heard.json] [--md out.md] [--json out.json]
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
import {judge,diffText,classify,normalize} from './compare.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const HEARD=resolve(ROOT,'tests/release/clip-text-heard.json');
const sha256=b=>createHash('sha256').update(b).digest('hex');

export function runCheck({blocks,heard,only}){
 const cuts=heard?.cuts||{},used=new Set(),rows=[];
 for(const b of blocks){
  if(only&&!new RegExp(only).test(b.id))continue;
  const key=cutKey(b.media,b.range);used.add(key);
  const r=judge(b,cuts[key]);
  if(r.heard!==undefined&&b.script&&normalize(b.script).join(' ')!==normalize(b.displayed).join(' '))r.scriptVerdict=classify(b.script,r.heard).verdict;
  rows.push({block:b,key,result:r});
 }
 const stale=only?[]:Object.keys(cuts).filter(k=>!used.has(k));
 const failures=rows.filter(x=>x.result.verdict!=='MATCH');
 return {rows,failures,stale,ok:!failures.length&&!stale.length};
}

const md=s=>String(s??'').replaceAll('|','\\|').replaceAll('\n',' / ');
const rng=b=>b.range?`${b.range[0]}–${b.range[1]}`:'whole';
export function report({rows,failures,stale},title){
 const classes=[...new Set(rows.map(x=>x.block.cls))],verdicts=['MATCH','TRUNCATED_END','TRUNCATED_START','LEADING_EXTRA','TRAILING_EXTRA','WRONG','NOT_TRANSCRIBED'];
 const L=[`# ${title}`,'',`${rows.length} blocks, ${rows.length-failures.length} match, ${failures.length} fail${stale.length?`, ${stale.length} stale transcripts`:''}.`,'',
  '| block class | '+verdicts.join(' | ')+' | total |','|---|'+'---|'.repeat(verdicts.length+1)];
 for(const c of classes){const xs=rows.filter(x=>x.block.cls===c);L.push(`| ${c} | `+verdicts.map(v=>xs.filter(x=>x.result.verdict===v).length).join(' | ')+` | ${xs.length} |`);}
 if(failures.length){
  L.push('','## Failures','','| block | window s | verdict | heard matches the recorded script? | diff | displayed | heard |','|---|---|---|---|---|---|---|');
  for(const {block:b,result:r} of failures)L.push(`| ${b.id} | ${rng(b)} | ${r.verdict} | ${r.scriptVerdict??'-'} | ${md([diffText(r),...r.notes].filter(Boolean).join('; '))} | ${md(b.displayed)} | ${md(r.heard??'')} |`);
 }
 if(stale.length)L.push('','## Stale transcripts (no block cuts these any more)','',...stale.map(k=>`- ${k}`));
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
 const result=runCheck({blocks,heard,only:arg('--only')});
 const text=report(result,title);
 if(arg('--md'))writeFileSync(arg('--md'),text);
 if(arg('--json'))writeFileSync(arg('--json'),JSON.stringify(result.rows.map(({block:b,key,result:r})=>({id:b.id,cls:b.cls,range:b.range,key,verdict:r.verdict,flags:r.flags,diff:diffText(r),notes:r.notes,displayed:b.displayed,heard:r.heard??null,scriptVerdict:r.scriptVerdict??null})),null,1)+'\n');
 console.log(text);
 if(!result.ok)console.error(`clip-text: FAIL — ${result.failures.length} of ${result.rows.length} blocks: the words heard in the cut differ from the words on the screen${result.stale.length?`; ${result.stale.length} stale transcripts`:''}.`);
 else console.log(`clip-text: PASS — ${result.rows.length} blocks, heard words equal displayed words.`);
 return result.ok?0:1;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main(process.argv.slice(2));
