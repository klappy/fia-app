import {createHash} from 'node:crypto';
import {issueProducerReceipt} from '../../../server/fia/preparation/source-associations/producer-receipt.mjs';
// TEST ONLY (CONTRACT Q14): a fake producer standing in for the trusted composer, which will read the fresh-source-observation
// primitive on retained storage. No production module imports this file. It shapes a read() result for given bytes and lets the
// real issuer verify and brand it; overrides let tests forge each field.
const sha=x=>createHash('sha256').update(x).digest('hex');
export function fakeProducerReceipt({bytes,owner='BibleAquifer',collection='FIATranslationGuide',revision,path,contentType='application/json',observedSha256=sha(bytes),observedBytes=bytes.length,sourceVersionKind='publisher-version'}){
 const read={state:'observed',observationSha256:'0'.repeat(64),observation:{binding:{source:{logicalId:'fake-producer',url:`https://raw.githubusercontent.com/${owner}/${collection}/${revision}/${path}`,sourceVersionKind,sourceVersion:revision,publisherVersion:sourceVersionKind==='publisher-version'?revision:null}},sha256:observedSha256,bytes:observedBytes,contentType}};
 return issueProducerReceipt(read,bytes);
}
