// Every block the app plays, with the words its screen shows.
// A block is one screen's start/stop window into a delivered recording (or a
// whole pre-cut file). The list is built from the published content only:
// packs (displayed text), delivery sidecars (playbackRange + delivered media),
// Scripture alignments (verse highlight windows) and prepared-audio descriptors.
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

export const CONTENT='apps/web/public/content';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// What the reading stage shows for this activity (App.svelte guideText): a
// "together" reading group shows the lit item (sourceText); otherwise
// narration || prompt.
export function displayText(activity,pack){
 const gid=activity.readingGroupId;
 if(gid&&(pack.listContracts||[]).some(b=>b.id===gid&&b.layout==='together'))return activity.sourceText||activity.narration||activity.prompt||'';
 return activity.narration||activity.prompt||'';
}
export const stripVerseNumbers=text=>text.split('\n').map(line=>line.replace(/^\s*\d+\s+/,'')).join('\n');
const extFor=(mime,url)=>mime==='audio/ogg'?'ogg':mime==='audio/mpeg'||url.endsWith('.mp3')?'mp3':url.split('.').pop().slice(0,4);
// Python round(x, 3) for the shifted pack-alignment windows (half-even on the binary value).
const round3=x=>Number(x.toFixed(3));

// A reader maps a published /content/... or /audio/... path to bytes.
export function localReader(root){
 const pub=join(root,'apps/web/public');
 return {
  bytes:path=>readFileSync(join(pub,path)),
  list:dir=>readdirSync(join(pub,dir),{recursive:true}).filter(x=>x.endsWith('.json')).map(x=>`${dir}/${x}`).sort(),
 };
}

export function buildBlocks(reader){
 const json=path=>JSON.parse(reader.bytes(path));
 const read=[];const track=path=>{read.push(path);return path;};
 const j=path=>json(track(path));
 const packs=new Map();
 for(const p of reader.list('/content/packs'))packs.set(p.split('/').at(-2),p);
 const packCache=new Map(),pack=pid=>{if(!packCache.has(pid))packCache.set(pid,j(packs.get(pid)));return packCache.get(pid);};
 const blocks=[];
 for(const scPath of reader.list('/content/delivery')){
  const sc=j(scPath),pid=sc.packId,pk=pack(pid),acts=new Map(pk.activities.map(a=>[a.id,a]));
  const ledgers=new Map();
  for(const l of [...(sc.recordingLedger?[sc.recordingLedger]:[]),...(sc.recordingLedgers||[])])ledgers.set(l.sha256,j(l.url));
  const defaultLedger=sc.recordingLedger?.sha256;
  for(const e of sc.entries){
   const d=e.delivery;if(d.kind!=='audio')continue;
   const media={url:d.url,sha256:d.sha256,bytes:d.bytes,ext:extFor(d.mime,d.url),duration:d.duration};
   const where=`${CONTENT}${scPath.slice('/content'.length)} path=${e.path}`;
   if(e.audioReplacement){
    const uid=e.audioReplacement.ledgerEntryId,a=acts.get(uid);
    const ledger=ledgers.get(e.audioReplacement.recordingLedgerSha256||defaultLedger);
    if(!a||!ledger||!ledger.mappings.some(m=>m.activityId===uid))throw Error(`unbound guide range ${pid}/${uid}`);
    blocks.push({id:`${pid}/${uid}`,passage:pid,unit:uid,cls:'guide-range',displayed:displayText(a,pk),script:a.sourceText??null,media,range:[e.playbackRange.startSeconds,e.playbackRange.endSeconds],where});
   }else if(e.scriptureReplacement||e.scriptureRangeOnly){
    const aid=(e.scriptureReplacement||e.scriptureRangeOnly).assetId,asset=pk.assets[aid];
    blocks.push({id:`${pid}/${aid}`,passage:pid,unit:aid,cls:'scripture-range',displayed:asset.verses.map(v=>stripVerseNumbers(v.text)).join('\n'),media,range:[e.playbackRange.startSeconds,e.playbackRange.endSeconds],where});
    if(e.scriptureAlignment){
     const al=j(e.scriptureAlignment.url);
     for(const v of al.verses)blocks.push({id:`${pid}/${aid}#v${v.verse}`,passage:pid,unit:`${aid} v${v.verse}`,cls:'scripture-verse',displayed:stripVerseNumbers(v.text),media,range:[v.start,v.end],where:`${CONTENT}${e.scriptureAlignment.url.slice('/content'.length)} verse ${v.verse}`});
    }
   }else if(e.path.startsWith('/audio/source/scripture-')){
    const aid=e.path.split('/').at(-1).replace(/\.[^.]+$/,''),asset=pk.assets[aid];
    blocks.push({id:`${pid}/${aid}`,passage:pid,unit:aid,cls:'scripture-whole',displayed:asset.verses.map(v=>stripVerseNumbers(v.text)).join('\n'),media,range:null,where});
    const off=e.timing?.mapping?.offsetSeconds||0;
    for(const v of asset.alignment?.verses||[])blocks.push({id:`${pid}/${aid}#v${v.verse}`,passage:pid,unit:`${aid} v${v.verse}`,cls:'scripture-verse',displayed:stripVerseNumbers(v.text),media,range:[round3(v.start+off),round3(v.end+off)],where:`${CONTENT}${packs.get(pid).slice('/content'.length)} assets.${aid}.alignment verse ${v.verse} (+${off}s mapping)`});
   }else if(e.path.startsWith('/audio/source/term-')){
    const tid=e.path.split('/').at(-1).slice('term-'.length).replace(/\.[^.]+$/,''),asset=pk.assets[tid];
    blocks.push({id:`${pid}/term-${tid}`,passage:pid,unit:`term-${tid}`,cls:'term-whole',displayed:asset.description||asset.text||'',media,range:null,where});
   }
  }
  // Bundled pre-cut clips (the logical audio) for the same pack.
  for(const a of pk.activities){
   const src=a.audioSrc||'';if(!/^\/audio\/source\/S\d\d-U\d+\.mp3$/.test(src))continue;
   const data=reader.bytes(track(src));
   blocks.push({id:`${pid}/${a.id}@clip`,passage:pid,unit:a.id,cls:'bundled-clip',displayed:displayText(a,pk),script:a.sourceText??null,media:{path:src,sha256:sha256(data),bytes:data.length,ext:'mp3'},range:null,where:`apps/web/public${src} (activity.audioSrc)`});
  }
 }
 for(const pp of reader.list('/content/prepared-audio')){
  const pa=j(pp),pk=pack(pa.packId),acts=new Map(pk.activities.map(a=>[a.id,a])),d=pa.delivery;
  const media={url:pa.source.url,served:d.url,sha256:d.sha256,bytes:d.bytes,ext:'mp3',duration:d.duration};
  for(const x of pa.activities){
   const a=acts.get(x.activityId);if(!a)throw Error(`unbound prepared range ${pa.packId}/${x.activityId}`);
   blocks.push({id:`${pa.packId}/${x.activityId}`,passage:pa.packId,unit:x.activityId,cls:'prepared-range',displayed:displayText(a,pk),script:a.sourceText??null,media,range:[x.playbackRange.startSeconds,x.playbackRange.endSeconds],where:`${CONTENT}${pp.slice('/content'.length)} activities[${x.activityId}]`});
  }
 }
 return {blocks,read:[...new Set([...read,...packs.values()])].sort()};
}

// The transcript of a block is keyed by exactly what is cut: the delivered
// bytes and the window. Moving a boundary or replacing a file needs a new
// transcription; an old one never vouches for it.
export const cutKey=(media,range)=>`${media.sha256}@${range?`${range[0]}-${range[1]}`:'whole'}`;
export const CONTEXT_PAD=1.5;
export const contextRange=range=>range&&[Math.max(0,range[0]-CONTEXT_PAD),range[1]+CONTEXT_PAD];
