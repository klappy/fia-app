import {canonicalJSONString,sha256} from './contract.mjs';
// Fixture pin for explicit local injection only. Nothing installs it as a route default.
export const P3_UNIT_QUALIFICATION_SHA256='fc51289a05090a794fa36528195d5d15dd92de62049f80bfd0f6b0d0bd6c366a';
export const QUALIFIED_CONTROLLER_SHA256='7d5fd19603a72f1d3d481652b20212656e23806e4a9e71bf535f3fd56d34da32';
const RECIPE='8bec2840b99d6c3ff92c4b6a5a53ed538d49df125df4cd6cf3bddb9969172972';
const PROFILE=Object.freeze({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',platform:'MacIntel',visibility:'visible'});
const need=x=>{if(!x)throw Error('unit-derivative-qualification-refused');};
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const pins=['sourceSha256','pcmSha256','canonicalSha256','correspondenceSha256','measurementSha256','planSha256','windowSha256','rawSha256'];
/** Candidate custody, raw/canonical recomputation and current source eligibility
 * must already be verified by the caller. A deployment-selected bundle hash is
 * authority; a hash supplied by the requesting client is not. No I/O or activation. */
export async function qualifyUnitDerivative({candidate,consumer,qualificationBytes,qualificationSha256}){
 need(qualificationBytes instanceof Uint8Array&&qualificationBytes.length>0&&qualificationBytes.length<=1048576&&hash(qualificationSha256));
 const bytes=new Uint8Array(qualificationBytes),c=structuredClone(candidate),who=structuredClone(consumer);
 need(who&&Object.keys(who).sort().join()==='edition,language,packId,presentationRevision,sourceTextSha256,sourceUnitId'&&Object.values(who).every(x=>typeof x==='string'&&x.length>0)&&hash(who.presentationRevision)&&hash(who.sourceTextSha256));
 need(await sha256(bytes)===qualificationSha256);
 const b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 need(b.schema==='fia-unit-derivative-qualification-bundle@1'&&b.recipeSha256===RECIPE&&same(b.consumerScope,Object.fromEntries(['packId','presentationRevision','language','edition'].map(k=>[k,who[k]]))));
 need(typeof b.manifestText==='string'&&typeof b.browserReceiptText==='string');
 const m=JSON.parse(b.manifestText),r=JSON.parse(b.browserReceiptText),manifestSha256=await sha256(b.manifestText),browserReceiptSha256=await sha256(b.browserReceiptText);
 need(r.schema==='fia-unit-file-native-eof-proof@1'&&r.status==='all-four-exact-pcm-native-eof-passed'&&same(r.profile,PROFILE)&&r.inputs.controllerSha256===QUALIFIED_CONTROLLER_SHA256&&r.inputs.manifestSha256===manifestSha256&&same(r.acceptedPlaybackRanges,[])&&r.nativeDacTailMeasured===false);
 need(Array.isArray(m.units)&&m.units.length===4&&Array.isArray(r.trials)&&r.trials.length===4&&same(m.units.map(x=>x.sourceUnitId).sort(),['S01-U005','S01-U006','S01-U007','S01-U008'])&&same(r.trials.map(x=>x.sourceUnitId).sort(),m.units.map(x=>x.sourceUnitId).sort()));
 const h=m.units.find(x=>x.sourceUnitId===who.sourceUnitId),t=r.trials.find(x=>x.sourceUnitId===who.sourceUnitId);need(h&&t);
 const p=c?.provenance,old=h.provenance;
 need(c.state==='candidate'&&c.qualifiedForPlayback===false&&same(c.acceptedPlaybackRanges,[])&&p?.schema==='fia-quiet-unit-pcm-derivative@1'&&p.status==='candidate-not-accepted'&&p.qualifiedForPlayback===false&&same(p.acceptedPlaybackRanges,[])&&pins.every(k=>hash(p[k])));
 need(p.sourceUnitId===who.sourceUnitId&&p.sourceTextSha256===who.sourceTextSha256&&old.sourceTextSha256===who.sourceTextSha256&&p.activityId===old.activityId);
 const prep=c.preparation?.identity;need(prep&&prep.canonicalSha256===p.canonicalSha256&&prep.sourceUnitId===who.sourceUnitId&&prep.sourceTextSha256===who.sourceTextSha256);
 need(Array.isArray(c.projection)&&c.projection.filter(x=>x.candidate).length===1);const selected=c.projection.find(x=>x.candidate);need(selected.sourceUnitId===who.sourceUnitId&&selected.sourceTextSha256===who.sourceTextSha256&&selected.status==='exact-unique'&&selected.qualifiedForPlayback===false&&same(selected.candidate,c.wav));
 for(const k of ['sourceSha256','pcmSha256','sourceSampleRange','quietEvidence','delivery'])need(same(p[k],old[k]));
 need(p.sourceSha256===m.sourceSha256&&r.sourceSha256===m.sourceSha256&&p.pcmSha256===m.pcmSha256&&c.wav?.sha256===h.deliverySha256&&p.delivery.sha256===h.deliverySha256&&p.delivery.bytes===h.bytes&&p.delivery.pcmSha256===h.pcmSha256&&p.delivery.samples===h.samples&&p.delivery.durationSeconds===h.duration);
 need(p.delivery.mime==='audio/wav'&&p.delivery.format==='ieee-float32le-mono'&&p.delivery.sampleRate===16000&&p.delivery.startSeconds===0&&p.delivery.playback==='whole-file-native-ended'&&p.delivery.wordHighlight===false&&p.delivery.verseHighlight===false);
 need(Number.isSafeInteger(h.samples)&&h.samples>0&&h.duration===h.samples/16000&&h.bytes===58+h.samples*4);
 need(t.status==='actual-bytes-exact-pcm-native-eof-passed'&&t.deliverySha256===h.deliverySha256&&t.decodedPcmSha256===h.pcmSha256&&t.samples===h.samples&&t.duration===h.duration&&t.rate===1&&t.playbackMode==='whole-file-native-ended'&&t.rangeArgumentOmitted===true&&t.initialMuted===false&&t.endCount===1&&same(t.errors,[]));
 need(Array.isArray(t.events)&&t.events.length>0&&t.events.every(e=>Number.isFinite(e.performanceMs)&&e.visibility==='visible'&&e.rate===1&&e.muted===false&&!['error','seeking','seeked'].includes(e.type)));
 const ends=t.events.filter(e=>e.type==='ended');need(ends.length===1&&t.events.some(e=>e.type==='playing'));
 const end=ends[0];need(end.ended===true&&Number.isFinite(end.duration)&&Number.isFinite(end.currentTime)&&Math.abs(end.duration-h.duration)<=1/16000&&Math.abs(end.currentTime-h.duration)<=1/16000&&Number.isFinite(t.controllerEnd?.performanceMs)&&end.performanceMs<=t.controllerEnd.performanceMs&&t.controllerEnd.visibility==='visible');
 need(t.events.every(e=>e.type!=='pause'||e.ended===true)&&t.events.every(e=>e.type!=='emptied'||e.performanceMs>=end.performanceMs));
 const bridge={schema:'fia-unit-derivative-byte-equivalence@1',consumer:who,qualificationSha256,recipeSha256:RECIPE,manifestSha256,browserReceiptSha256,historicalCanonicalSha256:old.canonicalSha256,currentCanonicalSha256:p.canonicalSha256,historicalProvenanceSha256:await sha256(canonicalJSONString(old)),currentProvenanceSha256:await sha256(canonicalJSONString(p)),currentPins:Object.fromEntries(pins.map(k=>[k,p[k]])),deliverySha256:h.deliverySha256,pcmSha256:h.pcmSha256,sourceSampleRange:p.sourceSampleRange,qualificationScope:'exact-delivery-bytes-native-eof-1x'};
 return {schema:'fia-qualified-unit-derivative@1',consumer:who,delivery:{quality:'original',mime:'audio/wav',sha256:h.deliverySha256,bytes:h.bytes,durationSeconds:h.duration,playback:'whole-file-native-ended',rate:1,wordHighlight:false,verseHighlight:false},browserProfile:{userAgent:PROFILE.userAgent,platform:PROFILE.platform},controllerSha256:QUALIFIED_CONTROLLER_SHA256,qualificationSha256,bridgeSha256:await sha256(canonicalJSONString(bridge)),bridge,nativeDacTimingQualified:false};
}
