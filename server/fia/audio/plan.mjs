import {sha256,canonical} from '../../core/jobs/codec.mjs';
export async function audioPlan(store, jobIds) {
  if(!Array.isArray(jobIds)||!jobIds.length||new Set(jobIds).size!==jobIds.length)throw Error('invalid-plan-jobs');
  const entries=[];
  for(const id of jobIds) {
    const job=await store.status(id);
    if(job.state!=='completed')throw Error('audio-unavailable');
    entries.push({jobId:id,portion:job.request.portion,source:job.request.source,language:job.request.language,effectiveTextSha256:job.request.effectiveTextSha256,generationConfigSha256:job.generationConfigSha256,output:job.output,provenance:'synthetic-fixture',attribution:'Local fixture; not a recording',completion:'confirm'});
  }
  const plan={schema:'fia-fixture-audio-plan@1',evidenceClass:'synthetic-fixture',playable:false,entries};
  // Canonical JSON's restricted number policy is explicit for byte counts.
  return {...plan,planSha256:sha256(canonical({...plan,entries:entries.map(e=>({...e,output:{...e.output,bytes:String(e.output.bytes)}}))}))};
}
