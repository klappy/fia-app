import ledger from '../../public/content/video-sources/0c6b18ce07914c6e61f8827a536836c0d0bfbcfb198f876d38aaa4f041d1836d.json' with {type:'json'};
// Demo opt-in and hostname are independent barriers; production never uses source URLs.
export function demoVideoSource(pack,asset,{enabled=import.meta.env?.VITE_FIA_VIDEO_DEMO_HQ,hostname=globalThis.location?.hostname}={}){
 if(enabled!=='true'||!['dev.fiaguide.app','staging.fiaguide.app'].includes(hostname))return null;
 const row=ledger.entries.find(r=>r.packId===pack.id&&r.presentationRevision===pack.revision&&r.assetId===asset?.id&&r.path===asset?.src);
 return row?.published.url||null;
}
