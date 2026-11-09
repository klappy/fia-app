import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(condition,reason)=>{if(!condition)throw Error(reason);};
const identity=f=>({sha256:f?.sha256,bytes:f?.bytes,mime:f?.mime,url:f?.deliveryURL??f?.url});
export function selectApprovedDelivery({manifest,ledgerBytes,logicalPath,size}){
 need(sha(ledgerBytes)===manifest.deliveryRevision,'Delivery ledger pin mismatch');
 const ledger=JSON.parse(ledgerBytes);
 need(ledger.packId===manifest.packId&&ledger.presentationRevision===manifest.presentationRevision,'Delivery presentation identity mismatch');
 const entries=ledger.entries.filter(e=>e.path===logicalPath),files=manifest.files.filter(f=>f.path===logicalPath);
 need(entries.length===1&&files.length===1,'Missing or ambiguous logical asset identity');
 const entry=entries[0],file=files[0];need(entry.defaultSize===file.defaultSize,'Default delivery size mismatch');
 const selectedSize=size??file.defaultSize;need(typeof selectedSize==='string'&&selectedSize.length>0,'Missing delivery size');
 const delivery=entry.variants?.[selectedSize]?.delivery,selected=file.variants?.[selectedSize];
 need(delivery&&selected,'Selected delivery variant unavailable');
 need(JSON.stringify(identity(delivery))===JSON.stringify(identity(selected)),'Manifest delivery output identity mismatch');
 need(/^[a-f0-9]{64}$/.test(delivery.sha256)&&Number.isSafeInteger(delivery.bytes)&&delivery.bytes>0&&delivery.mime==='image/webp','Invalid approved WebP output');
 return {path:logicalPath,size:selectedSize,deliveryRevision:manifest.deliveryRevision,presentationRevision:manifest.presentationRevision,...delivery};
}
export function verifyApprovedDeliveryBody(bytes,mime,delivery){
 need(bytes.byteLength===delivery.bytes&&sha(bytes)===delivery.sha256&&mime.split(';')[0]===delivery.mime,'Delivered output does not match approved variant');
 return true;
}
