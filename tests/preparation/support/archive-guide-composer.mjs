import {createHash} from 'node:crypto';
import {composeWithGuideRecords} from '../../../server/fia/preparation/source-associations/composer.mjs';
// TEST ONLY (CONTRACT Q14): a composer over injected archives and source-bindings, used by isolated tests to pin test-labelled
// descriptors. Production uses createGuideComposer (the build-pinned canonical guide reader); no production module imports this
// file or composeWithGuideRecords, which the import-boundary test enforces.
const sha=x=>createHash('sha256').update(x).digest('hex');
export function createArchiveGuideComposer({archives,sourceBindings,producer}){
 if(!Array.isArray(archives)||!archives.length||!sourceBindings)throw Error('composer-capability');
 const packs=new Map();for(const a of archives)for(const [id,p] of Object.entries(a.packs))packs.set(id,p);
 return composeWithGuideRecords({producer,guideRecordFor:async packId=>{const guide=packs.get(packId)?.guide;if(!guide)return {refused:'composer-unknown-pack'};
  return sha(Buffer.from(JSON.stringify(guide)))===sourceBindings[packId]?.guide?{guide}:{refused:'composer-binding-mismatch'};}});
}
