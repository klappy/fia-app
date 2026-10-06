// Pure assertions consumed by the browser gate; mutation fixtures exercise the same predicates.
export function assertPlayback({expected,currentActivityId,media,controls}){
 if(currentActivityId!==expected.activityId)throw Error('Current unit skipped or changed');
 if(controls.filter(c=>c.label==='Pause'&&!c.disabled).length!==1)throw Error('Expected exactly one Pause');
 if(!expected.sha256||!expected.range)throw Error('Missing canonical media binding');
 const active=media.filter(m=>!m.paused);
 if(active.length!==1)throw Error('Another media owner is active');
 const a=active[0];if(a.sha256!==expected.sha256||a.sourceUnitId!==expected.sourceUnitId||a.sourceTextSha256!==expected.sourceTextSha256)throw Error('Wrong recording or canonical instruction');
 if(a.before<expected.range.startSeconds||a.after>expected.range.endSeconds+0.05||a.after-a.before<0.25)throw Error('Native clock outside canonical range or not advancing');
 return true;
}
export function assertCancellation({operationId,completion,mediaAfterCompletion}){
 if(!operationId||completion?.operationId!==operationId||!['ready','failed','blocked'].includes(completion.state))throw Error('Original operation completion not observed');
 if(mediaAfterCompletion.some(a=>!a.paused||a.advanced))throw Error('Late completion resurrected playback');
 return true;
}
