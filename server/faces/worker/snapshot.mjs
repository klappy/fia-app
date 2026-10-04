/** Immutable storage adapter only; input validation and envelopes live in publication/read-operations. */
export function snapshotStorage(snapshot){
 if(snapshot.schema!=='fia.worker-read-snapshot.v1')throw Error('invalid-read-snapshot');
 const records=new Map(),artifacts=new Map();
 for(const item of snapshot.artifacts){
  if(artifacts.has(item.descriptor.sha256))throw Error('duplicate-artifact');
  artifacts.set(item.descriptor.sha256,Object.freeze(structuredClone(item)));
 }
 for(const record of snapshot.records){
  if(record.status!=='ready'||!artifacts.has(record.artifact.sha256))throw Error('invalid-snapshot-record');
  const key=record.packId+'@'+record.revision;
  if(records.has(key))throw Error('duplicate-revision');
  records.set(key,Object.freeze(structuredClone(record)));
 }
 const current=Object.freeze({...snapshot.current});
 for(const [id,revision] of Object.entries(current))if(!records.has(id+'@'+revision))throw Error('invalid-current-pointer');
 return {
  readCatalog(packId,revision){const record=records.get(packId+'@'+(revision||current[packId]));return record?structuredClone(record):{status:'unavailable',packId,reason:revision?'revision-not-found':'not-found'};},
  findArtifact(hash){const artifact=artifacts.get(hash);return artifact?{artifact:structuredClone(artifact.descriptor),content:artifact.content}:null;}
 };
}
