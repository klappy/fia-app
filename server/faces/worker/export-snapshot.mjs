import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Authority is an independently reviewed build input, never inferred from candidate labels. */
export function exportSnapshot(service,authority){
 const pin=/^[a-f0-9]{40}$/;
 if(!['publicationSourceCommit','publicationRecipeCommit','hostingRecipeCommit'].every(k=>pin.test(authority[k]||'')))throw Error('missing-authority-pin');
 const records=[],artifacts=[],current={};
 for(const accepted of authority.artifacts){
  const record=service.readPack({packId:accepted.packId,...(accepted.revision?{revision:accepted.revision}:{})});
  if(record.status!=='ready'||record.packId!==accepted.packId||hash(Buffer.from(JSON.stringify(record)))!==accepted.envelopeSha256||record.artifact.sha256!==accepted.sha256||record.artifact.bytes!==accepted.bytes)throw Error('unaccepted-record');
  const artifact=service.readArtifact({sha256:accepted.sha256});
  if(artifact.status!=='ready'||hash(Buffer.from(artifact.content))!==accepted.sha256||Buffer.byteLength(artifact.content)!==accepted.bytes)throw Error('invalid-artifact-bytes');
  if(JSON.stringify(record.artifact)!==JSON.stringify(artifact.artifact))throw Error('descriptor-mismatch');
  records.push(record);if(!artifacts.some(a=>a.descriptor.sha256===accepted.sha256))artifacts.push({descriptor:artifact.artifact,content:artifact.content});
  if(accepted.current){if(current[accepted.packId])throw Error('duplicate-current');current[accepted.packId]=record.revision;}
 }
 if(!records.length)throw Error('empty-publication');
 return {schema:'fia.worker-read-snapshot.v1',authority:{publicationSourceCommit:authority.publicationSourceCommit,publicationRecipeCommit:authority.publicationRecipeCommit,hostingRecipeCommit:authority.hostingRecipeCommit},records,artifacts,current};
}
export function writeSnapshot(service,authorityPath,output){const snapshot=exportSnapshot(service,JSON.parse(readFileSync(authorityPath)));mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(snapshot)+'\n');return snapshot;}
