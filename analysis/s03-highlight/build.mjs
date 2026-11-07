// Local, unapproved proposal. Does not write public runtime content or admit recordings.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {activityWords,validateTranscript} from '../../apps/web/src/lib/transcript.js';
import {activityAlignment} from '../../apps/web/src/lib/alignment.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const pins={source:'6ac21beefbcc42b721de90e499b842c07f6a63f0e6a8f91391ce511613412538',delivery:'4396f92c538c1292ccff0c9026f6608686006970df9f1b7028892edbfede05b9',rawWords:'6ad7a8af089f7a99201359634da6b0766021924b6fcdffdcdd40e804602fb401',recognition:'90d5c1cb6800927670b93e79127d86a6f8f908fdb072701c48450455493121c9',ledger:'32ca00e8dfa927e27233aea31a0abdd3768d700654d53d2d93b252b2645629eb',clock:'e133b61474be6c6bde51045d8a4d3401ac463e71e1741f46d8be7d21da3edce4',clockAnalysis:'a3204d55e4dbba1fedf6aeceb2daecd2a9c4e1f160053ceabc1540f79c0bac04',sourceReview:'3b87cde1e8731a426d58bdd60ae98e26b336e33aa484ae8bc9d7a64528287e33',historicalBoundaryReview:'3bce23b761fabf14b9099d585f31ec03e2e4c3ee2e3bd16a67b4bea983ec8f16',presentation:'ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975'};
const digest=b=>createHash('sha256').update(b).digest('hex');
export function loadInputs(){
 const content=root+'apps/web/public/content/';
 const pin=(folder,hash)=>{const bytes=readFileSync(content+folder+'/'+hash+'.json');if(digest(bytes)!==hash)throw Error('Evidence hash mismatch');return JSON.parse(bytes);};
 const beforeBytes=readFileSync(root+'analysis/s03-highlight/original-sidecar.json');
 if(digest(beforeBytes)!=='fb74cf179534a1f1a897e74766ea6ceb8067ab215dde8caa4df930e238503858')throw Error('Original sidecar fixture hash mismatch');
 return {raw:pin('recording-evidence',pins.rawWords),recognition:pin('recording-evidence',pins.recognition),ledger:pin('recording-sources',pins.ledger),clock:pin('recording-evidence',pins.clock),clockAnalysis:pin('recording-evidence',pins.clockAnalysis),boundaries:pin('recording-evidence',pins.historicalBoundaryReview),sourceReview:pin('recording-evidence',pins.sourceReview),pack:pin('packs/eng.MRK-1-1-13',pins.presentation),before:JSON.parse(beforeBytes),beforeSha256:digest(beforeBytes)};
}
const key=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu,'');
export function buildS03Proposal(input=loadInputs()){
 const {raw,recognition,ledger,clock,clockAnalysis,boundaries,sourceReview,pack,before}=input;
 if(raw.recordingSha256!==pins.source||raw.transcriptSha256!==pins.recognition||raw.clockDomain!=='decoded-pcm'||recognition.source.sha256!==pins.source||recognition.status!=='raw-asr-unreviewed-not-verbatim-certified'||ledger.recording.sha256!==pins.source||ledger.transcript.sha256!==pins.recognition||ledger.transcript.wordTimestampsSha256!==pins.rawWords||ledger.transcript.clockDomain!==raw.clockDomain||ledger.presentationRevision!==pins.presentation||before.audioSha256!==pins.delivery||before.sourceAudioSha256!==pins.source||before.clockDomain!=='delivery-media-seconds')throw Error('Source identity/clock mismatch');
 if(clock.status!=='accepted'||clock.sourceAudioSha256!==pins.source||clock.deliveryAudioSha256!==pins.delivery||clock.sourceClockDomain!==raw.clockDomain||clock.analysisSha256!==pins.clockAnalysis||clock.mapping.scale!==1||clock.mapping.offsetSeconds!==0||before.timingMapping.scale!==1||before.timingMapping.offsetSeconds!==0||clockAnalysis.source.sha256!==pins.source||clockAnalysis.delivery.sha256!==pins.delivery)throw Error('PCM mapping mismatch');
 if(sourceReview.status!=='accepted'||sourceReview.transcriptSha256!==pins.recognition||sourceReview.rangeReviewSha256!==pins.historicalBoundaryReview||ledger.drift.reviewEvidenceSha256!==pins.sourceReview||ledger.drift.reportSha256!==sourceReview.reportSha256||ledger.script.contentSha256!==sourceReview.scriptSha256)throw Error('Source review join mismatch');
 const sidecar=structuredClone(before),rows=[];
 for(const id of ['S03-U009','S03-U010','S03-U015']){
  const mapping=ledger.mappings.find(m=>m.activityId===id),a=pack.activities.find(a=>a.id===id),old=before.activities[id];
  if(mapping?.acceptance.status!=='accepted'||mapping.sourceRange.clockDomain!==raw.clockDomain||digest(a.sourceText)!==mapping.sourceTextSha256||a.sourceSha256!==mapping.sourceTextSha256||mapping.sourceRange.startSeconds*1000!==old.startMs||mapping.sourceRange.endSeconds*1000!==old.endMs)throw Error('Displayed text/range mismatch');
  const {first,lastExclusive}=mapping.wordSpan,words=raw.words.slice(first,lastExclusive);
  if(words.length!==old.words.length||words.length!==lastExclusive-first)throw Error('Word span mismatch');
  const deltas=[];
  const mapped=words.map((w,i)=>{
   const oldWord=old.words[i],shown=a.sourceText.slice(oldWord.from,oldWord.to);
   if(key(w.text)!==key(shown)||key(oldWord.text)!==key(shown))throw Error('Raw/display token mismatch');
   const startMs=Math.round((w.startSeconds*clock.mapping.scale+clock.mapping.offsetSeconds)*1000),endMs=Math.round((w.endSeconds*clock.mapping.scale+clock.mapping.offsetSeconds)*1000);
   deltas.push({sourceWordIndex:first+i,rawText:w.text,displayedText:shown,from:oldWord.from,to:oldWord.to,before:{startMs:oldWord.startMs,endMs:oldWord.endMs},proposal:{startMs,endMs}});
   return {...oldWord,startMs,endMs};
  });
  const proposal={...old,words:mapped,matched:mapped.length};
  const range={startSeconds:old.startMs/1000,endSeconds:old.endMs/1000};
  if(!activityWords(proposal,range)||!activityAlignment(a.sourceText,proposal.words,proposal.endMs))throw Error('Proposal rejected by unchanged runtime guards');
  sidecar.activities[id]=proposal;
  rows.push({id,displayedText:a.sourceText,wordSpan:mapping.wordSpan,unchangedRange:range,beforeGuardPass:!!activityWords(old,range),proposalGuardPass:true,sourceRangeAcceptance:mapping.acceptance,historicalCutHold:boundaries.rows.find(r=>r.activityId===id),deltas});
 }
 validateTranscript(sidecar);
 const group=pack.activities.filter(a=>a.readingGroupId==='S03-U009');
 const outerStart=ledger.mappings.find(m=>m.activityId===group[0].id).sourceRange.startSeconds;
 const outerEnd=ledger.mappings.find(m=>m.activityId===group.at(-1).id).sourceRange.endSeconds;
 const outerEdge=(id,edge,seconds)=>{
  const value=boundaries.rows.find(r=>r.activityId===id)?.edges.find(e=>e.edge===edge&&e.candidateSeconds===seconds);
  if(!value||!Number.isFinite(value.max10msRmsIn100msDbFS))throw Error('Missing exact pinned outer-edge evidence');
  return {evidenceSha256:pins.historicalBoundaryReview,activityId:id,edge,seconds,max10msRmsIn100msDbFS:value.max10msRmsIn100msDbFS};
 };
 const anchors=clockAnalysis.anchors.filter(a=>a.time>=outerStart&&a.time<=outerEnd);
 if(!anchors.length||anchors.some(a=>!Number.isFinite(a.lagSeconds)||!Number.isFinite(a.correlation)))throw Error('Invalid retained list anchors');
 const continuousGroupEvidence={range:{startSeconds:outerStart,endSeconds:outerEnd},outerEdges:{start:outerEdge(group[0].id,'start',outerStart),end:outerEdge(group.at(-1).id,'end',outerEnd)},correlationEvidenceSha256:pins.clockAnalysis,anchors,anchorSummary:{count:anchors.length,minimumCorrelation:Math.min(...anchors.map(a=>a.correlation)),maximumAbsoluteLagSeconds:Math.max(...anchors.map(a=>Math.abs(a.lagSeconds)))},status:'retained-source-evidence-not-native-or-acoustic-acceptance'};
 const count=t=>group.filter(a=>activityAlignment(a.sourceText,activityWords(t.activities[a.id],{startSeconds:t.activities[a.id].startMs/1000,endSeconds:t.activities[a.id].endMs/1000}),t.activities[a.id].endMs)).length;
 return {status:'UNAPPROVED-LOCAL-PROPOSAL',pins,beforeSha256:input.beforeSha256,recognitionStatus:recognition.status,sourceReview,continuousGroupEvidence,clockProof:{descriptor:clock,analysisStatus:clockAnalysis.status,analysisPublicationReady:clockAnalysis.publicationReady,clockExplanation:clockAnalysis.clock},rows,counts:{beforeStaticAlignedRows:count(before),proposalStaticAlignedRows:count(sidecar),groupRows:group.length,recordingAdmissions:0,acousticValidation:false},unchangedU024:JSON.stringify(sidecar.activities['S03-U024'])===JSON.stringify(before.activities['S03-U024']),sidecar};
}
