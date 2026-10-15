import test from 'node:test';
import assert from 'node:assert/strict';
import {recordingAllowed,permittedRecordings} from '../../apps/web/src/lib/recording-policy.js';
const paths=new Set(['/audio/source/guide.mp3','/audio/source/scripture.mp3']);
const generated={path:'/audio/source/guide.mp3',group:'audio',sha256:'old',deliveryURL:'https://transcode.klappy.dev/audio/generated'};
test('generated local and transcoded fallbacks are excluded, including saved descriptors',()=>{
 assert.equal(recordingAllowed(generated,paths),false);
 assert.equal(recordingAllowed({...generated,deliveryURL:undefined},paths),false);
 assert.deepEqual(permittedRecordings([generated,{path:'/image.jpg',group:'image'}],paths),[{path:'/image.jpg',group:'image'}]);
});
test('verified original guide and Scripture replacements sharing legacy paths survive',()=>{
 const guide={...generated,recordingLedgerEntryId:'unit',recordingLedgerSha256:'ledger'};
 const scripture={...generated,path:'/audio/source/scripture.mp3',scriptureLedgerEntryId:'reading',scriptureLedgerSha256:'ledger'};
 assert.equal(recordingAllowed(guide,paths),true);
 assert.equal(recordingAllowed(scripture,paths),true);
 assert.equal(recordingAllowed({...guide,recordingLedgerSha256:undefined},paths),false);
 assert.equal(recordingAllowed({...scripture,deliveryURL:undefined},paths),false);
});
