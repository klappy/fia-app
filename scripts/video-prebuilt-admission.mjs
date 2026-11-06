import {createHash} from 'node:crypto';
import {verifyVideoReplacement} from './video-publication.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity=value=>value&&/^[a-f0-9]{64}$/.test(value.sha256)&&value.sha256!=='0'.repeat(64)&&Number.isSafeInteger(value.bytes)&&value.bytes>0;
/** Offline build input only. Never fetches or authorizes publisher acquisition.
 * Explicit selection prevents bundled logical bytes from impersonating a qualified derivative.
 * The caller must publish this identity as selected; this does not alter a delivery sidecar.
 */
export function admitPrebuiltVideo({selection,bytes,...publication}){
 if(!['qualified-delivery','bundled-logical'].includes(selection))throw Error('video-prebuilt-selection');
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>16777216)throw Error('video-prebuilt-byte-limit');
 const {entry,file}=publication;
 if(!identity(file)||!identity(entry?.source)||!identity(entry?.delivery)||!identity(entry?.logicalSource))throw Error('video-prebuilt-identity');
 if(entry.delivery.kind!=='video'||entry.delivery.status!=='transformed'||entry.delivery.mime!=='video/mp4')throw Error('video-prebuilt-unqualified');
 const lineage=verifyVideoReplacement(publication);
 const expected=selection==='qualified-delivery'?entry.delivery:entry.logicalSource;
 if(bytes.byteLength!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('video-prebuilt-byte-mismatch');
 return Object.freeze({schema:'fia-video-prebuilt-admission@1',selection,assetId:entry.logicalSource.assetId,path:entry.path,
 sha256:expected.sha256,bytes:expected.bytes,mime:'video/mp4',
 logicalSourceSha256:lineage.logicalSourceSha256,publisherSourceSha256:entry.source.sha256,
 qualifiedDeliverySha256:entry.delivery.sha256,ledgerEntryId:entry.logicalSource.ledgerEntryId,
 grantsPublisherAcquisition:false});
}
