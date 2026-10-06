import {canonicalJSONString, sha256} from '../contract.mjs';

export const SPOKEN_REFERENCE_POLICY = Object.freeze({
  id: 'fia-spoken-format-equivalence-en@1',
  sourceSha256: '4e866a8051e1c6a5a99745bd63b9961c5a058a1e736b058a7696e01e85b2d5b3',
  grammar: 'fia-spoken-reference-en@1',
  bookTable: 'fia-english-reference-books@1',
});
// Intentionally finite. Abbreviations not listed here are unsupported, not guessed.
const names = [
 ['GEN','Genesis'],['EXO','Exodus'],['LEV','Leviticus'],['NUM','Numbers'],['DEU','Deuteronomy'],
 ['JOS','Joshua'],['JDG','Judges'],['RUT','Ruth'],['1SA','1 Samuel'],['2SA','2 Samuel'],
 ['1KI','1 Kings'],['2KI','2 Kings'],['1CH','1 Chronicles'],['2CH','2 Chronicles'],
 ['EZR','Ezra'],['NEH','Nehemiah'],['EST','Esther'],['JOB','Job'],['PSA','Psalms'],
 ['PRO','Proverbs'],['ECC','Ecclesiastes'],['SNG','Song of Solomon'],['ISA','Isaiah'],
 ['JER','Jeremiah'],['LAM','Lamentations'],['EZK','Ezekiel'],['DAN','Daniel'],['HOS','Hosea'],
 ['JOL','Joel'],['AMO','Amos'],['OBA','Obadiah'],['JON','Jonah'],['MIC','Micah'],['NAM','Nahum'],
 ['HAB','Habakkuk'],['ZEP','Zephaniah'],['HAG','Haggai'],['ZEC','Zechariah'],['MAL','Malachi'],
 ['MAT','Matthew'],['MRK','Mark','Mk','Mrk'],['LUK','Luke','Lk'],['JHN','John','Jn'],
 ['ACT','Acts'],['ROM','Romans'],['1CO','1 Corinthians'],['2CO','2 Corinthians'],
 ['GAL','Galatians'],['EPH','Ephesians'],['PHP','Philippians'],['COL','Colossians'],
 ['1TH','1 Thessalonians'],['2TH','2 Thessalonians'],['1TI','1 Timothy'],['2TI','2 Timothy'],
 ['TIT','Titus'],['PHM','Philemon'],['HEB','Hebrews'],['JAS','James'],['1PE','1 Peter'],
 ['2PE','2 Peter'],['1JN','1 John'],['2JN','2 John'],['3JN','3 John'],['JUD','Jude'],['REV','Revelation'],
];
const aliases = names.flatMap(([book,...variants])=>variants.flatMap(name=>{
 const text=name.toLowerCase();
 const spoken=text.replace(/^[123](?= )/, n=>['','one','two','three'][Number(n)]);
 return [...new Set([text,spoken])].map(alias=>({book,alias}));
}));
const units=['','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const tens=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const under100=n=>n<20?units[n]:tens[Math.floor(n/10)]+(n%10?' '+units[n%10]:'');
const numbers=new Map();
for(let n=1;n<=176;n++){
 numbers.set(String(n),n);
 if(n<100) numbers.set(under100(n),n);
 else {
  const rest=n-100;
  numbers.set('one hundred'+(rest?' '+under100(rest):''),n);
  if(rest) numbers.set('one hundred and '+under100(rest),n);
 }
}
const fold=s=>s.toLowerCase().trim().replace(/[ \t\r\n]+/g,' ');
const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const range=(a,b)=>Array.from({length:b-a},(_,i)=>a+i);
const classify=(classification,reason,pins)=>({classification,reason,pins,grantsAcceptance:false,timingValidated:false});

function writtenReference(text,offset){
 // ASCII digits only; punctuation is permitted only in these exact positions.
 const m=/^([A-Za-z1-3 ]+) ([1-9][0-9]{0,2}):([1-9][0-9]{0,2})(?:([-–])([1-9][0-9]{0,2}))?$/.exec(text);
 if(!m)return null;
 const a=aliases.find(x=>x.alias===fold(m[1]));
 if(!a)return null;
 const chapterStart=offset+m[1].length+1, verseStart=chapterStart+m[2].length+1;
 return {book:a.book,chapter:Number(m[2]),firstVerse:Number(m[3]),lastVerse:Number(m[5]??m[3]),
  fields:{book:[offset,offset+m[1].length],chapter:[chapterStart,chapterStart+m[2].length],firstVerse:[verseStart,verseStart+m[3].length],lastVerse:m[5]?[verseStart+m[3].length+1,offset+text.length]:[verseStart,verseStart+m[3].length]},
  separators:[{kind:'colon',scriptSpan:[chapterStart+m[2].length,verseStart]},...(m[4]?[{kind:'range',scriptSpan:[verseStart+m[3].length,verseStart+m[3].length+1]}]:[])]};
}
function spokenParses(tokens){
 const parses=[];
 for(const a of aliases){
  const bt=a.alias.split(' ');
  if(!bt.every((t,i)=>tokens[i]===t))continue;
  const start=bt.length, cstart=tokens[start]==='chapter'?start+1:start;
  for(let split=cstart+1;split<tokens.length;split++){
   const chapter=numbers.get(tokens.slice(cstart,split).join(' '));
   if(!chapter)continue;
   const marked=['verse','verses',':'].includes(tokens[split]);
   const vstart=split+(marked?1:0);
   for(let vend=vstart+1;vend<=tokens.length;vend++){
    const firstVerse=numbers.get(tokens.slice(vstart,vend).join(' '));
    if(!firstVerse)continue;
    let lastVerse=firstVerse,endStart=vend;
    const connector=tokens[vend];
    if(vend<tokens.length){
     if(!['to','through','-','–'].includes(connector))continue;
     endStart=vend+1;lastVerse=numbers.get(tokens.slice(endStart).join(' '));
     if(!lastVerse)continue;
    }
    parses.push({book:a.book,chapter,firstVerse,lastVerse,
     fields:{book:range(0,start),chapter:range(cstart,split),firstVerse:range(vstart,vend),lastVerse:vend===tokens.length?range(vstart,vend):range(endStart,tokens.length)},
     markers:range(start,cstart).concat(marked?[split]:[],vend<tokens.length?[vend]:[])});
   }
  }
 }
 return parses;
}

/** Trusted caller supplies a parser-identified span and a reviewed versification manifest.
 * This module deliberately does not discover spans or approve alignment/playback.
 */
export async function compareSpokenReference(input){
 const {script,scriptSha256,recognitionBytes,recognitionSha256,context,versification,versificationSha256}=input??{};
 if(typeof script!=='string'||script.length>100000||!(recognitionBytes instanceof Uint8Array)||recognitionBytes.length>1048576||!hash(scriptSha256)||!hash(recognitionSha256)||!hash(versificationSha256))throw Error('reference-evidence-input');
 if(await sha256(new TextEncoder().encode(script))!==scriptSha256||await sha256(recognitionBytes)!==recognitionSha256||await sha256(canonicalJSONString(versification))!==versificationSha256)throw Error('reference-evidence-hash');
 if(!context||context.language!=='eng'||context.kind!=='bible-reference'||!names.some(([b])=>b===context.book)||typeof versification?.revision!=='string'||!versification.revision.trim())throw Error('reference-trusted-context');
 const {scriptSpan,wordSpan}=context;
 const bounds=(span,max)=>Array.isArray(span)&&span.length===2&&span.every(Number.isSafeInteger)&&span[0]>=0&&span[1]>span[0]&&span[1]<=max;
 if(!bounds(scriptSpan,script.length))throw Error('reference-script-span');
 // Do not normalize a substring carved out of another lexical token.
 const lexical=c=>c!==undefined&&/[\p{L}\p{N}]/u.test(c);
 if(lexical(script[scriptSpan[0]-1])||lexical(script[scriptSpan[1]]))throw Error('reference-script-boundary');
 let raw;
 try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(recognitionBytes));}catch{throw Error('reference-raw-json');}
 if(!Array.isArray(raw.words)||raw.words.length>10000||!bounds(wordSpan,raw.words.length)||wordSpan[1]-wordSpan[0]>30)throw Error('reference-word-span');
 for(let i=0;i<raw.words.length;i++){
  const w=raw.words[i];
  if(typeof w?.word!=='string'||!w.word.trim()||w.word.length>200||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<w.start||(i&&(w.start<raw.words[i-1].start||w.end<raw.words[i-1].end)))throw Error('reference-word-evidence');
 }
 const pins={...SPOKEN_REFERENCE_POLICY,scriptSha256,recognitionSha256,versificationSha256,versificationRevision:versification.revision,bookTableSha256:await sha256(canonicalJSONString(aliases)),numberTableSha256:await sha256(canonicalJSONString([...numbers])),context:JSON.parse(canonicalJSONString(context))};
 pins.normalizationSha256=await sha256(canonicalJSONString(pins));
 const expected=writtenReference(script.slice(...scriptSpan),scriptSpan[0]);
 if(!expected)return classify('unsupported','written-reference-grammar',pins);
 if(expected.book!==context.book)return classify('unsupported','context-book-mismatch',pins);
 const chapterCounts=versification.books?.[context.book];
 if(!Array.isArray(chapterCounts)||!chapterCounts.length||chapterCounts.length>176||chapterCounts.some(n=>!Number.isSafeInteger(n)||n<1||n>176))throw Error('reference-versification');
 const valid=r=>r.chapter>=1&&r.chapter<=chapterCounts.length&&r.firstVerse>=1&&r.lastVerse>=r.firstVerse&&r.lastVerse<=chapterCounts[r.chapter-1];
 if(!valid(expected))return classify('unsupported','written-versification',pins);
 const selected=raw.words.slice(...wordSpan);
 const tokens=selected.map(w=>fold(w.word));
 // One raw word may not smuggle several grammar tokens or combined punctuation.
 if(tokens.some(t=>t.includes(' ')))return classify('unsupported','raw-token-boundary',pins);
 const parses=spokenParses(tokens);
 // Count grammar parses BEFORE script equality/versification filtering.
 if(parses.length>1)return classify('recognition-ambiguity','multiple-field-assignments',pins);
 if(!parses.length)return classify('unsupported','spoken-reference-grammar',pins);
 const found=parses[0];
 if(found.book!==context.book||!valid(found)||['book','chapter','firstVerse','lastVerse'].some(k=>found[k]!==expected[k]))return classify('semantic-wording-difference','reference-fields-differ',pins);
 const wordTrace=index=>({wordIndex:index+wordSpan[0],word:raw.words[index+wordSpan[0]].word,start:raw.words[index+wordSpan[0]].start,end:raw.words[index+wordSpan[0]].end});
 return {...classify('formatting-equivalent','unique-context-bound-reference',pins),reference:{book:found.book,chapter:found.chapter,firstVerse:found.firstVerse,lastVerse:found.lastVerse},
  trace:{fields:Object.fromEntries(Object.entries(found.fields).map(([key,indexes])=>[key,{scriptSpan:expected.fields[key],scriptText:script.slice(...expected.fields[key]),words:indexes.map(wordTrace)}])),markers:found.markers.map(wordTrace),separators:expected.separators.map(s=>({...s,scriptText:script.slice(...s.scriptSpan)}))}};
}

/** Evidence only for a trusted parser's numbered label at the start of a prompt. */
export async function compareSpokenPromptLabel(input){
 const {script,scriptSha256,recognitionBytes,recognitionSha256,context}=input??{};
 if(typeof script!=='string'||script.length>100000||!(recognitionBytes instanceof Uint8Array)||recognitionBytes.length>1048576||!hash(scriptSha256)||!hash(recognitionSha256))throw Error('label-evidence-input');
 if(await sha256(new TextEncoder().encode(script))!==scriptSha256||await sha256(recognitionBytes)!==recognitionSha256)throw Error('label-evidence-hash');
 if(!context||context.kind!=='numbered-prompt-label'||context.language!=='eng')throw Error('label-trusted-context');
 const {promptSpan,labelSpan,wordSpan}=context;
 const bounds=(span,max,empty=false)=>Array.isArray(span)&&span.length===2&&span.every(Number.isSafeInteger)&&span[0]>=0&&(empty?span[1]>=span[0]:span[1]>span[0])&&span[1]<=max;
 if(!bounds(promptSpan,script.length)||!bounds(labelSpan,script.length)||labelSpan[0]<promptSpan[0]||labelSpan[1]>promptSpan[1]||!/^[ \t\r\n]*$/.test(script.slice(promptSpan[0],labelSpan[0])))throw Error('label-prompt-start');
 // The complete label must end before whitespace and a nonempty prompt body.
 const after=script.slice(labelSpan[1],promptSpan[1]);
 if(!/^[ \t\r\n]+\S/.test(after))throw Error('label-prompt-boundary');
 let raw;
 try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(recognitionBytes));}catch{throw Error('label-raw-json');}
 if(!Array.isArray(raw.words)||raw.words.length>10000||!bounds(wordSpan,raw.words.length,true)||wordSpan[1]-wordSpan[0]>2)throw Error('label-word-span');
 for(let i=0;i<raw.words.length;i++){
  const w=raw.words[i];
  if(typeof w?.word!=='string'||!w.word.trim()||w.word.length>200||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<w.start||(i&&(w.start<raw.words[i-1].start||w.end<raw.words[i-1].end)))throw Error('label-word-evidence');
 }
 const labelNumbers=[...numbers].filter(([,n])=>n<=20);
 const pins={policyId:SPOKEN_REFERENCE_POLICY.id,policySha256:SPOKEN_REFERENCE_POLICY.sourceSha256,grammar:'fia-spoken-prompt-label-en@1',scriptSha256,recognitionSha256,numberTableSha256:await sha256(canonicalJSONString(labelNumbers)),context:JSON.parse(canonicalJSONString(context))};
 pins.normalizationSha256=await sha256(canonicalJSONString(pins));
 const text=script.slice(...labelSpan),m=/^(?:([1-9]|1[0-9]|20)\.|\(([1-9]|1[0-9]|20)\))$/.exec(text);
 if(!m)return classify('unsupported','written-label-grammar',pins);
 if(wordSpan[0]===wordSpan[1])return classify('unsupported','unmatched-structural-label',pins);
 const tokens=raw.words.slice(...wordSpan).map(w=>fold(w.word));
 const hasMarker=tokens.length===2&&tokens[0]==='number';
 const value=tokens.length===1?numbers.get(tokens[0]):hasMarker?numbers.get(tokens[1]):undefined;
 if(!value||value>20)return classify('unsupported','spoken-label-grammar',pins);
 const expected=Number(m[1]??m[2]);
 if(value!==expected)return classify('semantic-wording-difference','label-values-differ',pins);
 const wordTrace=i=>({wordIndex:i,word:raw.words[i].word,start:raw.words[i].start,end:raw.words[i].end});
 const digitStart=labelSpan[0]+(m[2]?1:0),digitEnd=digitStart+String(expected).length;
 const punctuation=m[2]?[[labelSpan[0],digitStart],[digitEnd,labelSpan[1]]]:[[digitEnd,labelSpan[1]]];
 return {...classify('formatting-equivalent','exact-structural-label-value',pins),label:expected,
  trace:{value:{scriptSpan:[digitStart,digitEnd],scriptText:script.slice(digitStart,digitEnd),words:[wordTrace(wordSpan[0]+(hasMarker?1:0))]},markers:hasMarker?[wordTrace(wordSpan[0])]:[],separators:punctuation.map(scriptSpan=>({kind:'label-punctuation',scriptSpan,scriptText:script.slice(...scriptSpan)}))}};
}
