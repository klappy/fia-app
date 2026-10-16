// Adds one book's raw source packs (built by the v2 pipeline: `npm run book -- <BOOK> eng spa` at the
// SOURCE revision's pipeline and pins) to the bundled compiler inputs, so build.mjs compiles them through
// the same path as Mark.
//   node server/fia/compiler/presentation/ingest-book.mjs <v2-checkout> <BOOK>
// Writes: source-packs-<book>.json.gz (packs + byte inventory; the Mark archive source-packs.json.gz stays
// byte-identical because release authorities pin its hash), source-bindings.json (pinned input hashes),
// lists.json and examples.json (semantic ledgers). The ledgers are derived structurally, never from text:
// a list group is the paragraph right before a run of list-items (S01 = discussion/separate, others =
// descriptive-list/together); the example is the run of source-`hidden` units. This rule reproduces all
// 136 reviewed Mark ledgers exactly (checked by --verify-mark). Derived entries stay `proposed`.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {digest} from './compile.mjs';
const here=name=>new URL('./'+name,import.meta.url);
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const FILES=['guide-units','guide','manifest','narration','resources','rights','scripture'];
const pick=u=>({id:u.id,text:u.text,textSha256:u.textSha256});
export function deriveLedgers(pack){
 const groups=[];let example=null;
 for(const s of pack.guide.steps){
  const us=s.units;
  for(let i=0;i<us.length;i++)if(us[i].kind==='list-item'&&i>0&&us[i-1].kind!=='list-item'){
   const items=[];for(let j=i;j<us.length&&us[j].kind==='list-item';j++)items.push(pick(us[j]));
   const discussion=s.id==='S01';
   groups.push({sectionId:s.id,intro:pick(us[i-1]),items,purpose:discussion?'discussion':'descriptive-list',layout:discussion?'separate':'together',reviewStatus:'proposed'});
  }
  const hidden=us.filter(u=>u.hidden);
  if(hidden.length&&!example)example={sectionId:s.id,boundary:hidden[0].id,units:hidden.map(pick)};
 }
 const g=pack.guide;
 return {list:{packId:g.packId,guideContentSha256:g.contentSha256,groups},example:{packId:g.packId,guideContentSha256:g.contentSha256,...(example||{sectionId:null,boundary:null,units:[]}),reviewStatus:'proposed'}};
}
const [checkout,book]=process.argv.slice(2).filter(a=>!a.startsWith('--'));
const bundle=JSON.parse(gunzipSync(readFileSync(here('source-packs.json.gz'))));// Mark: read-only, for --verify-mark
const lists=json(here('lists.json')),examples=json(here('examples.json')),bindings=json(here('source-bindings.json'));
const shape=l=>JSON.stringify(l.groups.map(g=>[g.sectionId,g.purpose,g.layout,g.intro.id,g.items.map(i=>i.id)]));
if(process.argv.includes('--verify-mark')){
 let ok=0;for(const l of lists.packs){const d=deriveLedgers(bundle.packs[l.packId]),e=examples.packs.find(x=>x.packId===l.packId);
  if(shape(l)===shape(d.list)&&e.boundary===d.example.boundary&&JSON.stringify(e.units.map(u=>u.id))===JSON.stringify(d.example.units.map(u=>u.id)))ok++;else console.error('mismatch',l.packId);}
 console.log(JSON.stringify({verifiedMark:ok,of:lists.packs.length}));if(ok!==lists.packs.length)process.exit(1);
}
if(checkout&&book){
 const out={revision:bundle.revision,inventory:[],packs:{}};
 const root=join(checkout,'data/packs'),ids=readdirSync(root).filter(id=>new RegExp(`^(eng|spa)\\.${book}-`).test(id)).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
 for(const id of ids){
  const data={};
  for(const name of FILES){const path=`data/packs/${id}/${name}.json`,bytes=readFileSync(join(checkout,path));data[name]=JSON.parse(bytes);
   out.inventory.push({path,bytes:bytes.length,sha256:digest(bytes)});}
  out.packs[id]=data;
  bindings[id]=Object.fromEntries(FILES.map(name=>[name,digest(JSON.stringify(data[name]))]));
  const {list,example}=deriveLedgers(data);
  lists.packs=lists.packs.filter(p=>p.packId!==id).concat(list);examples.packs=examples.packs.filter(p=>p.packId!==id).concat(example);
 }
 out.inventory.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 writeFileSync(here(`source-packs-${book.toLowerCase()}.json.gz`),gzipSync(JSON.stringify(out),{level:9}));
 for(const [name,doc] of [['source-bindings.json',bindings],['lists.json',lists],['examples.json',examples]])writeFileSync(here(name),JSON.stringify(doc,null,2)+'\n');
 console.log(JSON.stringify({book,ingested:ids.length}));
}
