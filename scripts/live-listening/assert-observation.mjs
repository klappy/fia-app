// Pure assertions consumed by the browser gate; mutation fixtures exercise the same predicates.
export function assertPlayback({expected,currentActivityId,media,controls}){
 if(!expected||!Array.isArray(media)||!Array.isArray(controls)||!media.length||!controls.length)throw Error('Missing observation');
 if(!/^[a-f0-9]{64}$/.test(expected.sha256||'')||!/^[a-f0-9]{64}$/.test(expected.sourceTextSha256||''))throw Error('Invalid digest');
 if(currentActivityId!==expected.activityId)throw Error('Current unit skipped or changed');
 if(controls.filter(c=>c.label==='Pause'&&!c.disabled).length!==1)throw Error('Expected exactly one Pause');
 if(!expected.sha256||!expected.range)throw Error('Missing canonical media binding');
 const active=media.filter(m=>!m.paused);
 if(active.length!==1)throw Error('Another media owner is active');
 const a=active[0];if(![a.before,a.after,expected.range.startSeconds,expected.range.endSeconds].every(Number.isFinite)||expected.range.endSeconds<=expected.range.startSeconds)throw Error('Invalid clock or range');if(a.sha256!==expected.sha256||a.sourceUnitId!==expected.sourceUnitId||a.sourceTextSha256!==expected.sourceTextSha256)throw Error('Wrong recording or canonical instruction');
 if(a.before<expected.range.startSeconds||a.after>expected.range.endSeconds+0.05||a.after-a.before<0.25)throw Error('Native clock outside canonical range or not advancing');
 return true;
}
export function assertCancellation({operationId,completion,mediaAfterCompletion}){
 if(!operationId||completion?.operationId!==operationId||!['ready','failed','blocked'].includes(completion.state))throw Error('Original operation completion not observed');
 if(!Array.isArray(mediaAfterCompletion)||!mediaAfterCompletion.length||mediaAfterCompletion.some(a=>typeof a.paused!=='boolean'||typeof a.advanced!=='boolean'))throw Error('Missing owner observation');
 if(mediaAfterCompletion.some(a=>!a.paused||a.advanced))throw Error('Late completion resurrected playback');
 return true;
}

// Replay is a native seek/start event followed by advancement, not a race between late polls.
export function assertReplayRestart(sample){
 const {restart,binding,before,after}=sample||{};const owner=after?.findIndex(a=>!a.paused),a=after?.[owner],b=before?.[owner];const seek=restart?.seeked,play=restart?.playing,start=binding?.range?.startSeconds,end=binding?.range?.endSeconds;
 if(!a||!b||!seek||!play||![restart.actionAt,seek.at,play.at,seek.time,play.time,start,end].every(Number.isFinite))throw Error('Missing native Replay restart');
 if(seek.kind!=='seeked'||play.kind!=='playing'||seek.owner!==owner||play.owner!==owner||seek.src!==a.src||play.src!==a.src||seek.at<restart.actionAt||play.at<seek.at)throw Error('Unbound or stale Replay events');
 if(seek.time+0.001<start||seek.time-start>0.05||play.time+0.001<start||play.time>end||a.time<play.time||a.time-b.time<0.25)throw Error('Replay did not seek to canonical start and advance');
 return true;
}
