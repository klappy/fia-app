import {canonicalJSONString} from './contract.mjs';
// The current client renders its requested presentation. It cannot switch to an
// older script, so a retained backend snapshot must not become its ready result.
export function reviewedOriginalStatus(row,outcome){
 if(outcome.state!=='ready')return {state:'blocked',reason:outcome.reason??'reviewed-original-snapshot-required',result:null,resultSha256:null,resultSerialized:null};
 if(canonicalJSONString(outcome.servedSelection)!==canonicalJSONString(row.selection)||outcome.resultSha256!==row.accepted.expected.resultSha256)
  return {state:'blocked',reason:'reviewed-original-revision-mismatch',result:null,resultSha256:null,resultSerialized:null};
 return {state:'ready',reason:null,result:outcome.result,resultSha256:outcome.resultSha256,resultSerialized:outcome.resultSerialized,reviewedSnapshotSchema:'fia-reviewed-original-snapshot@1'};
}
