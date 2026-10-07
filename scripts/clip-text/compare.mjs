// Words heard vs words displayed. Normalization is explicit and small so a
// reader can audit every equivalence; anything else is a real difference.

const ONES=Object.fromEntries('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ').map((w,i)=>[w,i]));
const TENS={twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const SCALES={hundred:100,thousand:1000};
const CONNECT=new Set(['through','thru','to','til','till']);
const LABELS=new Set(['chapter','chapters','verse','verses']);
const has=(o,k)=>Object.hasOwn(o,k);

function numberWordsToDigits(tokens){
 const out=[];let i=0;
 while(i<tokens.length){
  const t=tokens[i];
  if(has(ONES,t)||has(TENS,t)){
   let total=0,cur=0,j=i;
   while(j<tokens.length&&(has(ONES,tokens[j])||has(TENS,tokens[j])||(has(SCALES,tokens[j])&&j>i))){
    const w=tokens[j];
    if(has(ONES,w)){if(cur%10!==0||(cur&&ONES[w]>=10)||(cur>=10&&cur<20))break;cur+=ONES[w];}
    else if(has(TENS,w)){if(cur)break;cur+=TENS[w];}
    else{cur=Math.max(cur,1)*SCALES[w];if(SCALES[w]>=1000){total+=cur;cur=0;}}
    j++;
   }
   out.push(String(total+cur));i=j;
  }else{out.push(t);i++;}
 }
 return out;
}

// Orthography-only equivalences (ASR spelling, not speech) and homophones an
// ASR cannot separate.
const SPELL={metre:'meter',metres:'meters',kilometre:'kilometer',kilometres:'kilometers',centre:'center',
 saviour:'savior',honour:'honor',colour:'color',favour:'favor',neighbour:'neighbor',behaviour:'behavior',
 labour:'labor',travelled:'traveled',travelling:'traveling',judgement:'judgment',worshipped:'worshiped',worshipping:'worshiping',practise:'practice',practised:'practiced',practising:'practicing',
 km:'kilometers',kms:'kilometers',okay:'ok',whos:'whose',
 here:'hear',profit:'prophet',know:'no'};
const ISE=/^(visualis|dramatis|baptis|realis|recognis|organis|apologis|emphasis|criticis|symbolis|memoris|summaris|prioritis|characteris|sympathis|agonis|utilis|evangelis)(e|es|ed|ing|er|ers)$/;
const SPLIT={plotline:'plot line',storyline:'story line',everyday:'every day',cannot:'can not'};
const CONTRACT={"they're":'they are',"we're":'we are',"you're":'you are',"it's":'it is',"that's":'that is',"he's":'he is',
 "she's":'she is',"don't":'do not',"doesn't":'does not',"didn't":'did not',"isn't":'is not',"aren't":'are not',
 "can't":'can not',"won't":'will not',"i'm":'i am',"i'll":'i will',"we'll":'we will',"you'll":'you will',
 "let's":'let us',"there's":'there is',"here's":'here is',"what's":'what is',"who's":'who is',"we've":'we have',"they've":'they have'};
const spell=t=>has(SPELL,t)?SPELL[t]:t;

export function canon(tok){
 tok=spell(tok.replaceAll("'",''));
 const m=ISE.exec(tok);if(m)tok=m[1].slice(0,-1)+'z'+m[2];
 tok=spell(tok);
 // Plural / possessive / bare forms sound alike to an ASR: compare stems.
 return tok.length>3&&!/^\d+$/.test(tok)?tok.replace(/s+$/,''):tok;
}
const stripQuote=x=>x.replace(/^'+|'+$/g,'');

export function normalize(text,raw=false){
 let t=(text||'').normalize('NFKC').toLowerCase();
 t=t.replaceAll('’',"'").replaceAll('‘',"'").replaceAll('“',' ').replaceAll('”',' ');
 t=t.replace(/[{}[\]()"]/g,' ');
 t=t.replace(/(\d),(\d{3})\b/g,'$1$2');
 t=t.replace(/[‐-―\-/:;,.!?…]/g,' ');
 t=t.replace(/[^a-z0-9' ]/g,' ');
 let toks=t.split(/\s+/).map(stripQuote).filter(Boolean);
 toks=toks.flatMap(x=>(has(CONTRACT,x)?CONTRACT[x]:has(SPLIT,x)?SPLIT[x]:x).split(' '));
 toks=numberWordsToDigits(toks);
 const out=[];
 toks.forEach((x,k)=>{
  const prevNum=out.length>0&&/^\d+$/.test(out.at(-1)),nextNum=k+1<toks.length&&/^\d+$/.test(toks[k+1]);
  if(CONNECT.has(x)&&prevNum&&nextNum)return;
  if(LABELS.has(x)&&nextNum)return;
  out.push(x);
 });
 return raw?out:out.map(canon);
}

// Positions in the normalized displayed tokens where one sentence ends and the
// next begins. An ASR joins spoken sentences with an "and" it invents there.
export function sentenceBoundaries(text){
 const parts=(text||'').split(/(?<=[.!?…]['’"”)]*)\s+|\n+/).filter(s=>s.trim());
 const lengths=parts.map(p=>normalize(p,true).length);
 if(lengths.reduce((a,b)=>a+b,0)!==normalize(text,true).length)return new Set();
 const out=new Set();let n=0;for(const l of lengths.slice(0,-1)){n+=l;out.add(n);}
 return out;
}

// difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes(), so the
// edge classification matches the audit tool that produced the transcripts.
export function opcodes(a,b){
 const b2j=new Map();b.forEach((x,j)=>{if(!b2j.has(x))b2j.set(x,[]);b2j.get(x).push(j);});
 const longest=(alo,ahi,blo,bhi)=>{
  let besti=alo,bestj=blo,bestsize=0,j2len=new Map();
  for(let i=alo;i<ahi;i++){
   const next=new Map();
   for(const j of b2j.get(a[i])||[]){if(j<blo)continue;if(j>=bhi)break;const k=(j2len.get(j-1)||0)+1;next.set(j,k);if(k>bestsize){besti=i-k+1;bestj=j-k+1;bestsize=k;}}
   j2len=next;
  }
  while(besti>alo&&bestj>blo&&a[besti-1]===b[bestj-1]){besti--;bestj--;bestsize++;}
  while(besti+bestsize<ahi&&bestj+bestsize<bhi&&a[besti+bestsize]===b[bestj+bestsize])bestsize++;
  return [besti,bestj,bestsize];
 };
 const queue=[[0,a.length,0,b.length]],blocks=[];
 while(queue.length){
  const [alo,ahi,blo,bhi]=queue.pop(),[i,j,k]=longest(alo,ahi,blo,bhi);
  if(k){blocks.push([i,j,k]);if(alo<i&&blo<j)queue.push([alo,i,blo,j]);if(i+k<ahi&&j+k<bhi)queue.push([i+k,ahi,j+k,bhi]);}
 }
 blocks.sort((x,y)=>x[0]-y[0]||x[1]-y[1]||x[2]-y[2]);
 let i1=0,j1=0,k1=0;const merged=[];
 for(const [i2,j2,k2] of blocks){if(i1+k1===i2&&j1+k1===j2)k1+=k2;else{if(k1)merged.push([i1,j1,k1]);i1=i2;j1=j2;k1=k2;}}
 if(k1)merged.push([i1,j1,k1]);merged.push([a.length,b.length,0]);
 const ops=[];let i=0,j=0;
 for(const [ai,bj,size] of merged){
  const tag=i<ai&&j<bj?'replace':i<ai?'delete':j<bj?'insert':'';
  if(tag)ops.push([tag,i,ai,j,bj]);
  i=ai+size;j=bj+size;
  if(size)ops.push(['equal',ai,i,bj,j]);
 }
 return ops;
}

export const EDGE=['TRUNCATED_END','TRUNCATED_START','LEADING_EXTRA','TRAILING_EXTRA'];
// SOURCE_ID: a catalog/source id (t226) on screen or in the audio. A defect the
// screen and the audio share passes a words-only comparison, so it has its own rule.
// CUT_IN_SOUND: an audible window (guide, prepared, Scripture range) whose first
// or last 50 ms is louder than LOUD_DB starts or stops inside a sound; the
// recognizer can still complete a clipped word, so words alone would pass it.
const ORDER=['SOURCE_ID',...EDGE,'CUT_IN_SOUND','WRONG'];
export const LOUD_DB=-35;
export const AUDIBLE_CUT=new Set(['guide-range','prepared-range','scripture-range']);
const SOURCE_ID=/(?<![a-z0-9])t-?\d+(?![a-z0-9])/i;
const verdictOf=r=>ORDER.find(f=>r.flags.includes(f))||'MATCH';

export function classify(displayed,heard){
 const Dr=normalize(displayed,true),Hr=normalize(heard,true),D=Dr.map(canon),H=Hr.map(canon);
 const res={flags:[],lead:[],trail:[],missingStart:[],missingEnd:[],interior:[],notes:[]};
 if(!H.length){res.flags.push('WRONG');res.verdict='WRONG';res.errors=D.length;res.notes.push('nothing heard');return res;}
 const boundaries=sentenceBoundaries(displayed);
 let errors=0;
 for(const [tag,i1,i2,j1,j2] of opcodes(D,H)){
  if(tag==='equal')continue;
  const atStart=i1===0&&j1===0,atEnd=i2===D.length&&j2===H.length,dpart=Dr.slice(i1,i2),hpart=Hr.slice(j1,j2);
  if(tag==='insert'&&!atStart&&!atEnd&&boundaries.has(i1)&&hpart.every(x=>x==='and')){res.notes.push(`"and" joining two displayed sentences ignored (ASR sentence join) at word ${i1}`);continue;}
  errors+=Math.max(i2-i1,j2-j1);
  if(atStart&&tag==='insert')res.lead.push(...hpart);
  else if(atStart&&tag==='delete')res.missingStart.push(...dpart);
  else if(atEnd&&tag==='delete')res.missingEnd.push(...dpart);
  else if(atEnd&&tag==='insert')res.trail.push(...hpart);
  else if(atStart&&tag==='replace'){
   if(hpart.length>dpart.length){res.lead.push(...hpart.slice(0,hpart.length-dpart.length));res.interior.push([dpart,hpart.slice(hpart.length-dpart.length)]);}
   else if(hpart.length<dpart.length||(hpart.length&&dpart.length&&canon(dpart[0]).endsWith(canon(hpart[0]))))res.missingStart.push(...(dpart.slice(0,dpart.length-hpart.length).length?dpart.slice(0,dpart.length-hpart.length):dpart.slice(0,1)));
   else res.interior.push([dpart,hpart]);
  }else if(atEnd&&tag==='replace'){
   if(hpart.length>dpart.length){res.trail.push(...hpart.slice(dpart.length));res.interior.push([dpart,hpart.slice(0,dpart.length)]);}
   else if(hpart.length<dpart.length||(hpart.length&&dpart.length&&canon(dpart.at(-1)).startsWith(canon(hpart.at(-1)))))res.missingEnd.push(...(dpart.slice(hpart.length).length?dpart.slice(hpart.length):dpart.slice(-1)));
   else res.interior.push([dpart,hpart]);
  }else res.interior.push([dpart,hpart]);
 }
 res.errors=errors;
 if(res.missingEnd.length)res.flags.push('TRUNCATED_END');
 if(res.missingStart.length)res.flags.push('TRUNCATED_START');
 if(res.lead.length)res.flags.push('LEADING_EXTRA');
 if(res.trail.length)res.flags.push('TRAILING_EXTRA');
 if(res.interior.length)res.flags.push('WRONG');
 res.verdict=verdictOf(res);
 return res;
}

const HALLU=new Set(['you','thank','thanks','bye','so','okay','ok','oh','um','uh','hmm','mm']);
// Whisper invents "you" / "thank you" on silence. An extra word at an edge
// whose first/last 50 ms is silent, made only of those tokens, is not audio
// in the cut.
export function dropSilenceHallucination(r,edge,quiet=-50){
 for(const [flag,key,side] of [['TRAILING_EXTRA','trail','end'],['LEADING_EXTRA','lead','start']]){
  if(r.flags.includes(flag)&&edge&&Number.isFinite(edge[side])&&edge[side]<quiet&&r[key].every(x=>HALLU.has(x))){
   r.flags=r.flags.filter(f=>f!==flag);r.notes.push(`${flag} "${r[key].join(' ')}" dropped: ASR filler on a silent edge (${edge[side]} dBFS)`);r[key]=[];
  }
 }
 r.verdict=verdictOf(r);
}

const contains=(hay,needle)=>needle.length>0&&hay.some((_,i)=>i+needle.length<=hay.length&&needle.every((x,k)=>hay[i+k]===x));
// A missing edge word is a timing cut only if the same window widened by the
// context pad says it next to its displayed neighbours AND that word is not
// wholly inside the cut. If the speaker never says it there, it is wording
// (screen text vs recording). It is a short-crop recognizer miss only when its
// timed start (end) is at or after (before) the cut AND the cut's edge is
// quiet; a word timed up to `tol` outside the edge, or a cut whose first/last
// 50 ms is louder than LOUD_DB, lands inside the word and stays a timing cut
// (ambiguous within the word-timing tolerance). Either way the block still
// fails; this only names why.
export function confirmTruncation(r,displayed,context,range,tol=0.1,edge=null){
 if(!context)return;
 const D=normalize(displayed),C=normalize(context.text),timed=[];
 for(const [w,s,e] of context.words||[])for(const t of normalize(w))timed.push([t,s,e]);
 for(const [flag,key] of [['TRUNCATED_START','missingStart'],['TRUNCATED_END','missingEnd']]){
  if(!r.flags.includes(flag))continue;
  const m=normalize(r[key].join(' '),true).map(canon);
  const probe=flag==='TRUNCATED_START'?D.slice(0,m.length+3):D.slice(Math.max(0,D.length-m.length-3));
  let why=null;
  if(!contains(C,probe))why=`the widened window never says "${r[key].join(' ')}" (recording wording)`;
  else if(timed.length&&range){
   const toks=timed.map(x=>x[0]),n=probe.length,hit=toks.findIndex((_,i)=>i+n<=toks.length&&probe.every((x,k)=>toks[i+k]===x));
   if(hit>=0){
    const start=flag==='TRUNCATED_START',t=start?timed[hit][1]:timed[hit+n-1][2],cutAt=start?range[0]:range[1];
    const inside=start?t>=cutAt:t<=cutAt,near=Math.abs(t-cutAt)<=tol,db=edge?.[start?'start':'end'],loud=Number.isFinite(db)&&db>LOUD_DB;
    const word=`"${r[key].join(' ')}" ${start?'starts':'ends'} at ${t.toFixed(2)}s`;
    if(inside&&!loud)why=`${word}, inside the cut at ${cutAt}s and the edge is quiet (short-crop ASR miss, not timing)`;
    else if(inside||near){r.notes.push(`${flag} ambiguous, counted as timing: ${word}, ${inside?'inside':'outside'} the cut at ${cutAt}s by ${Math.round(Math.abs(t-cutAt)*1000)} ms${loud?`, and the cut ${start?'opens':'closes'} inside sound (${db} dBFS)`:' (within the word-timing tolerance)'}`);continue;}
   }
  }
  if(why===null){r.notes.push(`${flag} confirmed: the widened window says "${r[key].join(' ')}" outside the cut`);continue;}
  r.flags=r.flags.filter(f=>f!==flag);r.interior.push([r[key],[]]);r.notes.push(`${flag} not confirmed: ${why}`);
  if(!r.flags.includes('WRONG'))r.flags.push('WRONG');
  r[key]=[];
 }
 r.verdict=verdictOf(r);
}

export function diffText(r){
 const out=[];
 if(r.lead.length)out.push(`+lead "${r.lead.join(' ')}"`);
 if(r.missingStart.length)out.push(`-start "${r.missingStart.join(' ')}"`);
 if(r.missingEnd.length)out.push(`-end "${r.missingEnd.join(' ')}"`);
 if(r.trail.length)out.push(`+trail "${r.trail.join(' ')}"`);
 for(const [d,h] of r.interior)out.push(`${d.join(' ')||'∅'}→${h.join(' ')||'∅'}`);
 return out.join('; ');
}

// One block: the stored transcript of exactly its cut, judged against the
// words its screen shows, plus the two rules words cannot carry.
export function judge(block,heard){
 if(!heard)return {verdict:'NOT_TRANSCRIBED',flags:['NOT_TRANSCRIBED'],lead:[],trail:[],missingStart:[],missingEnd:[],interior:[],notes:['no transcript of this exact cut (media sha256 + window); run scripts/clip-text/transcribe.py']};
 const r=classify(block.displayed,heard.text);
 dropSilenceHallucination(r,heard.edge);
 if(block.range)confirmTruncation(r,block.displayed,heard.context,block.range,0.1,heard.edge);
 for(const [side,text] of [['displayed',block.displayed],['heard',heard.text]]){const m=SOURCE_ID.exec(text||'');if(m){if(!r.flags.includes('SOURCE_ID'))r.flags.push('SOURCE_ID');r.notes.push(`source id "${m[0]}" ${side==='displayed'?'on screen':'in the audio'}`);}}
 if(block.range&&AUDIBLE_CUT.has(block.cls))for(const side of ['start','end']){const db=heard.edge?.[side];if(Number.isFinite(db)&&db>LOUD_DB){if(!r.flags.includes('CUT_IN_SOUND'))r.flags.push('CUT_IN_SOUND');r.notes.push(`cut ${side==='start'?'opens':'closes'} inside sound: ${side} 50 ms at ${db} dBFS (> ${LOUD_DB})`);}}
 r.verdict=verdictOf(r);
 r.heard=heard.text;
 return r;
}
