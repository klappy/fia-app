import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {ArtifactStore,sha256} from '../../core/artifacts/store.mjs';
import {Catalog} from '../../core/publication/catalog.mjs';
import {createReadOperations} from './read-operations.mjs';
const trust=JSON.parse(readFileSync(new URL('./trusted-text.json',import.meta.url)));
const fullTrust=JSON.parse(readFileSync(new URL('./trusted-full-text.json',import.meta.url)));
const approvedTrust=JSON.parse(readFileSync(new URL('./trusted-approved-presentation.json',import.meta.url)));
if(sha256(Buffer.from(JSON.stringify(approvedTrust.media.files)))!==approvedTrust.media.inventorySha256)throw Error('Approved media inventory identity mismatch');
export const APPROVED_PACK_ID=approvedTrust.packId;
export const APPROVED_COOKBOOK_REVISION=approvedTrust.authority.recipeCommit;
export const approvedBundledBytes=()=>readFileSync(new URL('./approved-presentation.json',import.meta.url));
export const COOKBOOK_REVISION=trust.authority.recipeCommit;
export const FULL_COOKBOOK_REVISION=fullTrust.authority.recipeCommit;
export const FULL_PACK_ID=fullTrust.packId;
export const PUBLICATION_MAX_BYTES=1048576;
export const PACK_ID=trust.expected.packId;
export const bundledBytes=()=>readFileSync(new URL('./text-excerpt.json',import.meta.url));
export const fullBundledBytes=()=>readFileSync(new URL('./full-text.json',import.meta.url));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validId=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(x);
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const refused=code=>({status:'refused',code});
export function createService({seed=true}={}) {
  const artifacts=new ArtifactStore(),catalog=new Catalog(artifacts);
  function publish(input,{expectedRevision}={}) {
    let bytes, parsed, packId, metadata;
    try {
      bytes=Buffer.from(input);if(bytes.length>PUBLICATION_MAX_BYTES||!Buffer.from(bytes.toString('utf8')).equals(bytes))return refused('invalid-candidate');
      parsed=JSON.parse(bytes.toString('utf8'));
      if(!object(parsed))return refused('invalid-candidate');
      if(parsed.id===approvedTrust.presentationId) {
        if(bytes.length!==approvedTrust.bytes||sha256(bytes)!==approvedTrust.sha256)return refused('untrusted-approved-presentation');
        packId=approvedTrust.packId;
        metadata={capability:approvedTrust.capability,cookbookRevision:APPROVED_COOKBOOK_REVISION,artifactSource:approvedTrust.authority,identity:approvedTrust.identity,media:approvedTrust.media};
      }else if('id'in parsed) {
        // This authority is source-controlled and reviewed; candidate labels never confer trust.
        if(parsed.id!==fullTrust.packId||bytes.length!==fullTrust.bytes||sha256(bytes)!==fullTrust.sha256||parsed.revision!==fullTrust.artifactSource.embeddedRevision||parsed.cookbookRevision!==fullTrust.artifactSource.cookbookRevision)return refused('untrusted-full-text');
        packId=fullTrust.packId;
        metadata={capability:fullTrust.capability,cookbookRevision:FULL_COOKBOOK_REVISION,artifactSource:fullTrust.artifactSource,media:{status:'unavailable',reason:'applicability-unresolved'}};
      }else {
        const compared=structuredClone(parsed);
        if(!Array.isArray(compared.activities))return refused('invalid-candidate');
        for(const a of compared.activities){if(!object(a)||typeof a.text!=='string'||'textSha256'in a)return refused('invalid-candidate');a.textSha256=sha256(Buffer.from(a.text));delete a.text;}
        if(!isDeepStrictEqual(compared,trust.expected))return refused('untrusted-text');
        packId=parsed.packId;
        metadata={capability:parsed.capability,cookbookRevision:COOKBOOK_REVISION,media:parsed.media};
      }
    }catch{return refused('invalid-candidate');}
    if(expectedRevision!==null&&!validHash(expectedRevision))return refused('invalid-request');
    return catalog.publish({packId,bytes,expectedRevision,metadata});
  }
  const reads=createReadOperations({
    readCatalog:(packId,revision)=>catalog.read(packId,revision),
    findArtifact:hash=>{const found=artifacts.get(hash);return found?{artifact:found.descriptor,content:found.bytes.toString('utf8')}:null;},
  });
  if(seed){for(const bytes of [bundledBytes(),fullBundledBytes(),approvedBundledBytes()]){const result=publish(bytes,{expectedRevision:null});if(result.status!=='ready')throw Error('Bundled trust verification failed');}}
  return {publish,...reads,registerPreparing:packId=>{if(!validId(packId))throw Error('invalid-id');catalog.registerPreparing(packId);},artifactCount:()=>artifacts.size};
}
