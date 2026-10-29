import {createHash} from 'node:crypto';
// Producer receipts: the only form raw publisher evidence may take in buildSourceIndex (Terry ANSWER-SOURCE-EXPLICIT-AUTHORITY,
// cookbook 2771ded, Q1 and Q4). A receipt is a frozen object carrying a module-private brand. It is issued only from a
// fresh-source-observation read() result (an observed, verified receipt for one class-A guide file) and that file's whole
// retained bytes. The issuer hashes the bytes itself and extracts every fragment itself; the caller supplies no fragment or sha.
// The index then checks the receipt against the descriptor that trusted composition builds from the retained compiled archive.
//
// Boundary: the issuer is for the trusted production composer, which reads the primitive on retained storage. That composer
// does not exist yet: it waits on the class-A guide-text source route and admission (Q2 clause and Q3 route, Otto seat). Until
// then no production module imports issueProducerReceipt, so no explicit result is reachable in production. Isolated tests
// use it through a test-only fake producer (Q14), and a test enforces that import boundary.
const BRAND=new WeakSet(),sha=x=>createHash('sha256').update(x).digest('hex');
// Class-A source rule (Aquifer, ALPHA-CHARTER line 40): owner and URL shape only. The collection, revision, path and file sha
// are not listed here; each must equal the archive descriptor of the pack it serves.
export const GUIDE_SOURCE_CLASS=Object.freeze({class:'A',owner:'BibleAquifer',origin:'https://raw.githubusercontent.com',path:/^(?:eng|spa)\/json\/\d{1,3}\.content\.json$/});
const BOOKS=Object.freeze({41:'MRK',42:'LUK'});
// Every Text article whose single passage association maps to exactly one pack id, split after each </p> (no bytes dropped).
// Anything else is reported as unmapped, never guessed.
export function extractGuideFragments(bytes,{path}){
 const articles=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!Array.isArray(articles))throw Error('producer-receipt-shape');
 const language=path.slice(0,3),book=BOOKS[Number(/\/(\d+)\.content\.json$/.exec(path)?.[1])],byPack=new Map(),unmapped=[];
 articles.forEach((a,k)=>{
  if(a?.media_type!=='Text')return;
  const passages=a.associations?.passage,why=r=>unmapped.push({jsonPath:`$[${k}]`,contentId:a.content_id??null,reason:r});
  if(a.language!==language)return why('language-mismatch');if(!book)return why('unknown-book');if(!Array.isArray(passages)||passages.length!==1)return why('passage-count');
  const ref=x=>/^([1-9A-Z]{3}) (\d+):(\d+)$/.exec(x??''),s=ref(passages[0].start_ref_usfm),e=ref(passages[0].end_ref_usfm);
  if(!s||!e||s[1]!==book||e[1]!==book||typeof a.content!=='string')return why('passage-shape');
  const packId=`${language}.${book}-${s[2]}-${s[3]}-${s[2]===e[2]?'':`${e[2]}-`}${e[3]}`;if(!byPack.has(packId))byPack.set(packId,[]);byPack.get(packId).push({k,a});
 });
 const packs={};
 for(const [packId,list] of [...byPack].sort(([x],[y])=>x.localeCompare(y))){
  if(list.length!==1){for(const {k,a} of list)unmapped.push({jsonPath:`$[${k}]`,contentId:a.content_id??null,reason:'duplicate-passage',packId});continue;}
  const [{k,a}]=list;packs[packId]=Object.freeze(a.content.split(/(?<=<\/p>)/).map((html,n)=>Object.freeze({jsonPath:`$[${k}].content#p${n}`,html})));
 }
 return {packs,unmapped};
}
// read: the primitive's read() result {state:'observed', observationSha256, observation}; bytes: the retained original's bytes.
export function issueProducerReceipt(read,bytes){
 const o=read?.observation,src=o?.binding?.source;
 if(read?.state!=='observed'||!o||!src)throw Error('producer-receipt-unobserved');
 if(src.sourceVersionKind!=='publisher-version'||src.publisherVersion!==src.sourceVersion||!/^[a-f0-9]{40}$/.test(src.sourceVersion??''))throw Error('producer-receipt-version');
 const m=/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([a-f0-9]{40})\/(.+)$/.exec(src.url??'');
 if(!m||m[1]!==GUIDE_SOURCE_CLASS.owner||m[3]!==src.sourceVersion||!GUIDE_SOURCE_CLASS.path.test(m[4]))throw Error('producer-receipt-class');
 if(o.contentType!=='application/json')throw Error('producer-receipt-media');
 if(!(bytes instanceof Uint8Array)||bytes.length!==o.bytes||sha(bytes)!==o.sha256)throw Error('producer-receipt-bytes');
 const {packs}=extractGuideFragments(bytes,{path:m[4]});
 const receipt=Object.freeze({schema:'fia-guide-producer-receipt@1',owner:m[1],collection:m[2],revision:src.sourceVersion,path:m[4],fileSha256:o.sha256,bytes:o.bytes,observationSha256:read.observationSha256??null,packs:Object.freeze(packs)});
 BRAND.add(receipt);return receipt;
}
export function isProducerReceipt(x){return typeof x==='object'&&x!==null&&BRAND.has(x);}
