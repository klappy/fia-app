import {canonicalJSONString,sha256} from '../contract.mjs';
import {validateRecognitionIdentity} from './recognition-identity.mjs';
export const NORMALIZATION_REVISION='unicode-nfkc-lowercase-apostrophe@1';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function tokens(text){if(typeof text!=='string')throw Error('invalid-alignment-text');if(text.length>200000)throw Error('alignment-text-limit');return text.normalize('NFKC').toLowerCase().replaceAll('’',"'").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)||[];}
export async function retainedJSON(descriptor,resolveArtifact){
 if(!hash(descriptor?.sha256)||typeof descriptor.reference!=='string')throw Error('invalid-alignment-artifact');
 const resolved=await resolveArtifact(structuredClone(descriptor));if(!(resolved instanceof Uint8Array)||resolved.length>4*1024*1024)throw Error('invalid-alignment-bytes');
 const bytes=resolved.slice();if(await sha256(bytes)!==descriptor.sha256)throw Error('alignment-artifact-hash');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function storeJSON(value,storeArtifact){const bytes=new TextEncoder().encode(canonicalJSONString(value)),digest=await sha256(bytes),stored=await storeArtifact(bytes);if(stored?.sha256!==digest||typeof stored.reference!=='string'||!stored.reference)throw Error('alignment-store-mismatch');return {sha256:digest,reference:stored.reference};}
export function createAlignmentAdapter({resolveArtifact,resolveUnits,storeArtifact,normalizationRevision=NORMALIZATION_REVISION,recognitionValidator=validateRecognitionIdentity,recognitionSchema='fia-local-raw-recognition@1'}){
 if(normalizationRevision!==NORMALIZATION_REVISION||[resolveArtifact,resolveUnits,storeArtifact,recognitionValidator].some(fn=>typeof fn!=='function'))throw Error('alignment-policy-unavailable');
 return {paid:false,async run({input,nodeOutputs}){
  input=structuredClone(input);nodeOutputs=structuredClone(nodeOutputs);
  const raw=await retainedJSON(nodeOutputs.transcribe,resolveArtifact),script=structuredClone(await resolveUnits(structuredClone(input)));
  if(raw.schema!==recognitionSchema||raw.status!=='candidate'||raw.source?.sha256!==nodeOutputs.acquire?.sha256||!hash(raw.source?.sha256)||!Number.isFinite(raw.durationSeconds)||raw.durationSeconds<=0||raw.durationSeconds>600||!Array.isArray(raw.segments))throw Error('alignment-recognition-binding');
  await recognitionValidator(raw,input);
  if(script.scriptSha256!==input.scriptSha256||!hash(script.scriptSha256)||!Array.isArray(script.units)||!script.units.length||script.units.length>1000)throw Error('alignment-script-binding');
  const words=raw.segments.flatMap(segment=>{if(!Array.isArray(segment.words))throw Error('invalid-recognition-words');return segment.words;});if(words.length>10000)throw Error('alignment-word-limit');
  const heard=[],wordIndexes=[];let lastStart=0,lastEnd=0,wordTextLength=0;
  for(const [index,word] of words.entries()){
   if(!Number.isFinite(word.start)||!Number.isFinite(word.end)||word.start<lastStart||word.end<lastEnd||word.start<0||word.end<word.start||word.end>raw.durationSeconds)throw Error('invalid-recognition-clock');lastStart=word.start;lastEnd=word.end;
   if(typeof word.word!=='string'||(wordTextLength+=word.word.length)>200000)throw Error('alignment-text-limit');
   for(const token of tokens(word.word)){heard.push(token);wordIndexes.push(index);if(heard.length>10000)throw Error('alignment-token-limit');}
  }
  const mappings=[],ids=new Set(),units=new Set(),used=new Set();let lastTokenEnd=0,scriptTextLength=0;
  for(const unit of script.units){
   if(typeof unit.text!=='string'||unit.text.length>200000)throw Error('alignment-text-limit');
   if(typeof unit.activityId!=='string'||!unit.activityId||typeof unit.sourceUnitId!=='string'||!unit.sourceUnitId||ids.has(unit.activityId)||units.has(unit.sourceUnitId)||!hash(unit.sourceTextSha256)||await sha256(unit.text)!==unit.sourceTextSha256)throw Error('alignment-unit-binding');ids.add(unit.activityId);units.add(unit.sourceUnitId);
   scriptTextLength+=unit.text.length;if(scriptTextLength>200000)throw Error('alignment-text-limit');
   const expected=tokens(unit.text);if(!expected.length||expected.length>10000)throw Error('alignment-unit-limit');const matches=[];
   // KMP avoids quadratic repeated-token scans; each unit scans at most 10000 words.
   const prefix=new Array(expected.length).fill(0);
   for(let i=1,j=0;i<expected.length;i++){while(j&&expected[i]!==expected[j])j=prefix[j-1];if(expected[i]===expected[j])j++;prefix[i]=j;}
   for(let i=0,j=0;i<heard.length;i++){while(j&&heard[i]!==expected[j])j=prefix[j-1];if(heard[i]===expected[j])j++;if(j===expected.length){matches.push(i-j+1);j=prefix[j-1];}}
   const row={activityId:unit.activityId,sourceUnitId:unit.sourceUnitId,sourceTextSha256:unit.sourceTextSha256,expectedTokens:expected.length,matchCount:matches.length,status:'unmatched'};
   if(matches.length>1)row.status='ambiguous-repeated-phrase';
   else if(matches.length===1){const start=matches[0],end=start+expected.length;
    if(start<lastTokenEnd)row.status='out-of-order';
    else{const first=wordIndexes[start],last=wordIndexes[end-1],begin=words[first].start,finish=words[last].end;row.status=finish>begin?'exact-candidate':'zero-duration-candidate';row.tokenSpan={first:start,lastExclusive:end};row.wordSpan={first,lastExclusive:last+1};row.candidateRange={startSeconds:begin,endSeconds:finish,clockDomain:'decoded-source-samples-asr-estimate'};for(let i=start;i<end;i++)used.add(i);lastTokenEnd=end;}
   }
   mappings.push(row);
  }
  const report={schema:'fia-exact-word-alignment@1',status:'candidate',normalizationRevision,identity:{packId:input.packId,book:input.book,language:input.language,edition:input.edition,passage:input.passage,resource:input.resource,policyRevision:input.policyRevision},sourceSha256:raw.source.sha256,scriptSha256:script.scriptSha256,rawRecognitionSha256:nodeOutputs.transcribe.sha256,durationSeconds:raw.durationSeconds,wordCount:words.length,recognizedTokens:heard.length,unassignedRecognizedTokens:heard.length-used.size,mappings,acceptedPlaybackRanges:[]};
  return storeJSON(report,storeArtifact);
 }};
}
