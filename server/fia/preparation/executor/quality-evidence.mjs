import {retainedJSON} from './alignment.mjs';
import {canonicalJSONString} from '../contract.mjs';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const positive=x=>finite(x)&&x>0;
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const near=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<1e-8;
function requireValue(ok,reason){if(!ok)throw Error(reason);}
function index(rows){requireValue(Array.isArray(rows)&&rows.length<=10000,'invalid-units');const m=new Map();for(const r of rows){requireValue(typeof r?.activityId==='string'&&!m.has(r.activityId),'duplicate-or-invalid-unit');m.set(r.activityId,r);}return m;}
function cut(c,rate,samples){
 const q=c?.selectedQuietRun;
 requireValue(c?.state==='measured'&&c.quietRuns?.length===1&&same(c.quietRuns[0],q),'ambiguous-quiet-run');
 requireValue(Number.isSafeInteger(q.startSample)&&Number.isSafeInteger(q.endSampleExclusive)&&q.startSample>=0&&q.endSampleExclusive<=samples&&q.endSampleExclusive-q.startSample>=960,'invalid-quiet-geometry');
 requireValue(Number.isSafeInteger(c.cutSample)&&c.cutSample===(q.startSample+q.endSampleExclusive)/2&&near(c.cutSeconds,c.cutSample/rate),'invalid-cut');
 requireValue(near(q.startSeconds,q.startSample/rate)&&near(q.endSeconds,q.endSampleExclusive/rate)&&near(c.leftMarginSeconds,(c.cutSample-q.startSample)/rate)&&near(c.rightMarginSeconds,(q.endSampleExclusive-c.cutSample)/rate),'invalid-quiet-margin');
 requireValue(finite(c.centered60msDbfs)&&c.centered60msDbfs< -45&&finite(q.maximum10msDbfs)&&q.maximum10msDbfs< -45,'nonquiet-cut');
 requireValue(finite(c.searchInterval?.startSeconds)&&finite(c.searchInterval?.endSeconds)&&q.startSeconds>=c.searchInterval.startSeconds&&q.endSeconds<=c.searchInterval.endSeconds,'quiet-outside-search');
}
/** Diagnostic only. No supplied flag or receipt can grant acceptance. */
export async function assessUnitQualityEvidence({alignment,signal=null,browser=null,sourceSha256,rawRecognitionSha256,guideScriptSha256,resolveArtifact}){
 requireValue([sourceSha256,rawRecognitionSha256,guideScriptSha256].every(hash),'invalid-binding');
 const a=await retainedJSON(alignment,resolveArtifact);
 requireValue(a.schema==='fia-exact-word-alignment@1'&&a.status==='candidate'&&a.sourceSha256===sourceSha256&&a.rawRecognitionSha256===rawRecognitionSha256&&a.scriptSha256===guideScriptSha256,'alignment-binding');
 const mappings=index(a.mappings);let s,b,signalError,browserError;
 if(signal)try{s=await retainedJSON(signal,resolveArtifact);requireValue(s.schema==='fia-signal-boundary-measurements@1'&&s.status==='candidate'&&s.sourceSha256===sourceSha256&&s.rawRecognitionSha256===rawRecognitionSha256&&s.guideScriptSha256===guideScriptSha256&&s.alignmentSha256===alignment.sha256&&hash(s.scriptSha256),'signal-binding');requireValue(s.pcm?.sampleRate===16000&&Number.isSafeInteger(s.pcm.samples)&&s.pcm.samples>0&&hash(s.pcm.sha256),'signal-pcm');requireValue(s.policy?.windowSamples===160&&s.policy.minimumQuietSamples===960&&s.policy.thresholdDbfsExclusive===-45&&s.policy.selection==='single-qualifying-run-only-midpoint','signal-policy');requireValue(positive(s.sourceMetadata?.sampleRate)&&Number.isInteger(s.sourceMetadata.channels)&&s.sourceMetadata.channels>0&&typeof s.sourceMetadata.codec==='string'&&typeof s.runtime?.av==='string','signal-profile');index(s.units);}catch(e){signalError=e.message;s=null;}
 if(browser)try{b=await retainedJSON(browser,resolveArtifact);requireValue(s&&b.schema==='fia-browser-clock-measurement@1'&&b.status==='measurement-complete-not-acceptance'&&b.sourceSha256===sourceSha256&&b.measurementSha256===signal.sha256,'browser-binding');requireValue(b.nativeClockMappingQualified===false,'unsupported-clock-qualification');requireValue(typeof b.userAgent==='string'&&b.userAgent.length>0&&typeof b.platform==='string'&&b.platform.length>0&&positive(b.nativeDuration)&&finite(b.nativeMinusDecodedDuration),'browser-profile');requireValue(b.pcm?.sampleRate===16000&&b.pcm.samples===s.pcm.samples&&hash(b.pcm.sha256)&&near(b.pcm.duration,b.pcm.samples/16000)&&near(b.nativeMinusDecodedDuration,b.nativeDuration-b.pcm.duration),'browser-pcm');requireValue(Array.isArray(b.trials)&&b.trials.length<=60000&&Array.isArray(b.cuts)&&b.cuts.length<=20000&&Array.isArray(b.clockLandmarks),'browser-arrays');for(const x of b.clockLandmarks)requireValue(finite(x.percent)&&Number.isSafeInteger(x.anchorSample)&&x.anchorSample>=0&&x.anchorSample<s.pcm.samples&&finite(x.bestShiftSamples)&&finite(x.normalizedRmsResidual)&&x.normalizedRmsResidual>=0&&finite(x.alternativeOutsideOneMs?.shift)&&finite(x.alternativeOutsideOneMs?.error),'browser-landmark');for(const x of [...b.trials,...b.cuts])requireValue(mappings.has(x.activityId),'browser-unknown-unit');}catch(e){browserError=e.message;b=null;}
 const sm=s?index(s.units):new Map();
 const units=[...mappings.values()].map(row=>{
  const result={activityId:row.activityId,sourceUnitId:row.sourceUnitId,sourceTextSha256:row.sourceTextSha256,correspondence:row.status,signal:'missing',browser:'missing',recognition:'uncalibrated',nativeClock:'unqualified',reasons:[],acceptedPlaybackRanges:[]};
  if(signalError){result.signal='blocked';result.reasons.push(signalError);}if(browserError){result.browser='blocked';result.reasons.push(browserError);}
  const u=sm.get(row.activityId);
  if(u)try{requireValue(u.sourceUnitId===row.sourceUnitId&&u.sourceTextSha256===row.sourceTextSha256,'signal-unit-binding');if(u.state==='blocked'){result.signal='blocked';result.reasons.push(u.reason||'signal-blocked');return result;}requireValue(row.status==='exact-candidate'&&same(u.wordSpan,row.wordSpan)&&near(u.envelope?.startSeconds,row.candidateRange?.startSeconds)&&near(u.envelope?.endSeconds,row.candidateRange?.endSeconds),'signal-word-binding');cut(u.left,16000,s.pcm.samples);cut(u.right,16000,s.pcm.samples);requireValue(finite(u.envelope?.startSeconds)&&finite(u.envelope?.endSeconds)&&u.left.cutSeconds<u.envelope.startSeconds&&u.envelope.startSeconds<u.envelope.endSeconds&&u.envelope.endSeconds<u.right.cutSeconds,'invalid-envelope');result.signal='measured';}catch(e){result.signal='blocked';result.reasons.push(e.message);}
  if(b&&result.signal==='measured')try{
   const cuts=b.cuts.filter(x=>x.activityId===row.activityId);requireValue(cuts.length===2&&new Set(cuts.map(x=>x.edge)).size===2,'browser-cuts');for(const c of cuts){requireValue(['left','right'].includes(c.edge)&&near(c.cutSeconds,u[c.edge].cutSeconds)&&same(c.sourceQuietRun,u[c.edge].selectedQuietRun)&&finite(c.centered60msDbfs),'browser-cut-binding');}
   const trials=b.trials.filter(x=>x.activityId===row.activityId),seen=new Set();requireValue(trials.length===6,'browser-trials-missing');for(const t of trials){const k=`${t.rate}:${t.repeat}`;requireValue([1,1.5].includes(t.rate)&&[1,2,3].includes(t.repeat)&&!seen.has(k),'browser-trial-membership');seen.add(k);requireValue(near(t.start,u.left.cutSeconds)&&near(t.end,u.right.cutSeconds)&&finite(t.seekError)&&finite(t.stopTime)&&finite(t.overshoot)&&near(t.stopTime-t.end,t.overshoot)&&t.visibility==='visible'&&t.visibilityChanged===false,'browser-trial-values');}result.browser='measured-unqualified';
  }catch(e){result.browser='blocked';result.reasons.push(e.message);}
  return result;
 });
 return {schema:'fia-unit-quality-report@1',status:'diagnostic-not-acceptance',evidence:{alignmentSha256:alignment.sha256,signalSha256:signal?.sha256??null,browserSha256:browser?.sha256??null,measurementProgramSha256:s?.scriptSha256??null},sourceSha256,rawRecognitionSha256,guideScriptSha256,units,acceptedPlaybackRanges:[]};
}
