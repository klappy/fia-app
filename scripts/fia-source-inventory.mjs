#!/usr/bin/env node
// Local metadata only. Does not fetch, acquire, admit, or prepare media.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {canonicalJSONString,sha256} from '../server/fia/preparation/contract.mjs';
import {createGuideDiscoveryAdapter,publishedGuideMetadataFromAudit} from '../server/fia/preparation/executor/discovery.mjs';
const encode=v=>new TextEncoder().encode(canonicalJSONString(v));
const hash=v=>sha256(encode(v));
const order=(a,b)=>a<b?-1:a>b?1:0;
export async function inventory(inputs){
 const relationships=new Map(),sources=new Map(),provenance=new Map();
 for(const input of inputs){
  let bytes=new Uint8Array(input.bytes),digest=await sha256(bytes);
  if(digest!==input.sha256)throw Error('inventory-input-identity');
  const original=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(original.schema==='fia-dynamic-discovery-resolver-audit@1')({bytes,sha256:digest}=await publishedGuideMetadataFromAudit(bytes,digest));
  // Reuse the runtime parser and publisher policy; never call its storage adapter.
  await createGuideDiscoveryAdapter({metadataBytes:bytes,metadataSha256:digest,bucket:null});
  const metadata=JSON.parse(new TextDecoder().decode(bytes));
  provenance.set(input.sha256,{inputSha256:input.sha256,inputSchema:original.schema,metadataSha256:digest});
  for(const row of metadata.rows){
   // URL equality establishes metadata overlap only, not equal recording bytes.
   const sourceId=await hash({publisher:'fia-guide',sourceURL:row.sourceURL});
   if(!sources.has(sourceId))sources.set(sourceId,{sourceId,identityKind:'publisher-url-sha256',observedBytesSha256:null,relationships:new Set(),books:new Set(),languages:new Set()});
   const binding=Object.fromEntries(['packId','presentationRevision','book','language','edition','publisherSourceId','publisherPassage','stepId','sourceMetadataSha256','guideContentSha256'].map(k=>[k,row[k]]));
   const units=[...row.sourceUnits].sort((a,b)=>order(a.sourceUnitId,b.sourceUnitId));
   const relationshipId=await hash({...binding,sourceId,sourceUnits:units});
   const selectionId=canonicalJSONString([row.packId,row.presentationRevision,row.stepId]);
   const previous=relationships.get(selectionId);
   if(previous&&previous.relationshipId!==relationshipId)throw Error('inventory-conflicting-selection');
   const record=previous??{relationshipId,sourceId,...binding,sourceUnits:units,metadataSha256:new Set()};
   record.metadataSha256.add(digest);relationships.set(selectionId,record);
   const source=sources.get(sourceId);source.relationships.add(relationshipId);source.books.add(row.book);source.languages.add(row.language);
  }
 }
 const rows=[...relationships.values()].map(r=>({...r,metadataSha256:[...r.metadataSha256].sort(order)})).sort((a,b)=>order(a.relationshipId,b.relationshipId));
 const groups=new Map();
 // Explicit requested dimensions distinguish missing input from zero availability.
 for(const book of ['MRK','LUK'])for(const language of ['eng','spa'])groups.set(`${book}:${language}`,{book,language,rows:[]});
 for(const row of rows){const key=`${row.book}:${row.language}`;if(!groups.has(key))groups.set(key,{book:row.book,language:row.language,rows:[]});groups.get(key).rows.push(row);}
 const coverage=[...groups.values()].map(({book,language,rows})=>({book,language,inputStatus:rows.length?'observed':'not-in-input',passageCount:new Set(rows.map(r=>r.packId)).size,sectionCount:rows.length,unitRequestCount:rows.reduce((n,r)=>n+r.sourceUnits.length,0),sourceURLCount:new Set(rows.map(r=>r.sourceId)).size,denominator:'supplied validated metadata only',totalCorpusDenominator:null,playableCount:null})).sort((a,b)=>order(`${a.book}:${a.language}`,`${b.book}:${b.language}`));
 const sourceRows=[...sources.values()].map(s=>({...s,relationships:[...s.relationships].sort(order),books:[...s.books].sort(order),languages:[...s.languages].sort(order)})).sort((a,b)=>order(a.sourceId,b.sourceId));
 return {schema:'fia-source-inventory@1',scope:'metadata relationships; no byte availability or playback acceptance asserted',provenance:[...provenance.values()].sort((a,b)=>order(a.inputSha256,b.inputSha256)),coverage,sources:sourceRows,relationships:rows,markLukeOverlap:sourceRows.filter(s=>s.books.includes('MRK')&&s.books.includes('LUK')).map(s=>s.sourceId)};
}
async function main(args){
 if(args.length===0||args.length%2)throw Error('usage: node scripts/fia-source-inventory.mjs <metadata-or-audit.json> <expected-sha256> [<file> <sha256> ...]');
 const inputs=[];for(let i=0;i<args.length;i+=2)inputs.push({bytes:await readFile(args[i]),sha256:args[i+1]});
 process.stdout.write(canonicalJSONString(await inventory(inputs))+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main(process.argv.slice(2)).catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
