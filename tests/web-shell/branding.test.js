import test from 'node:test';import {inflateSync} from 'node:zlib';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {JSDOM} from 'jsdom';
const root=new URL('../../apps/web/',import.meta.url),doc=new JSDOM(readFileSync(new URL('index.html',root),'utf8')).window.document,manifest=JSON.parse(readFileSync(new URL('public/manifest.webmanifest',root)));
const description='Explore all 68 passages of Mark in English and Spanish with FIA guides, Scripture text, and resources.';
function one(selector,attr,expected){const all=doc.querySelectorAll(selector);assert.equal(all.length,1,selector);assert.equal(attr?all[0].getAttribute(attr):all[0].textContent,expected,selector);}
test('initial metadata names FIA Guide and binds one production social preview',()=>{
 one('title',null,'FIA Guide');for(const key of ['application-name','apple-mobile-web-app-title','twitter:title'])one(`meta[name="${key}"]`,'content','FIA Guide');one('meta[property="og:title"]','content','FIA Guide');
 one('meta[name="description"]','content',description);for(const key of ['og:description','twitter:description'])one(`meta[${key.startsWith('og:')?'property':'name'}="${key}"]`,'content','Equip Translators. Engage the Word. Transform Communities.');
 one('link[rel="canonical"]','href','https://fiaguide.app/');one('meta[property="og:url"]','content','https://fiaguide.app/');one('meta[property="og:type"]','content','website');one('meta[name="twitter:card"]','content','summary_large_image');
 for(const key of ['og:image','twitter:image'])one(`meta[${key.startsWith('og:')?'property':'name'}="${key}"]`,'content','https://fiaguide.app/assets/fia-share-1200x630.png');
 one('meta[property="og:image:width"]','content','1200');one('meta[property="og:image:height"]','content','630');one('meta[property="og:image:type"]','content','image/png');
 one('link[rel="apple-touch-icon"]','href','/assets/fia-apple-180.png');one('link[rel="icon"]','href','/assets/fia-favicon-32.png');
});
test('installation identity and verified logo dimensions are preserved',()=>{
 for(const key of ['name','short_name'])assert.equal(manifest[key],'FIA Guide');assert.equal(manifest.description,description);for(const key of ['id','scope','start_url'])assert.equal(manifest[key],'/');assert.equal(manifest.display,'standalone');assert.equal(manifest.background_color,'#F7F8FB');assert.equal(manifest.theme_color,'#0E1420');
 assert.deepEqual(manifest.icons.map(i=>[i.sizes,i.purpose]),[['192x192','any'],['512x512','any'],['512x512','maskable']]);
 const assets=[['fia-192.png',192,192],['fia-brand-192.png',192,192],['fia-512.png',512,512],['fia-maskable-512.png',512,512],['fia-apple-180.png',180,180],['fia-favicon-32.png',32,32],['fia-share-1200x630.png',1200,630]];
 for(const [name,w,h] of assets){const bytes=readFileSync(new URL('public/assets/'+name,root));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),w);assert.equal(bytes.readUInt32BE(20),h);}
 const hash=name=>createHash('sha256').update(readFileSync(new URL('public/assets/'+name,root))).digest('hex');assert.equal(hash('fia-192.png'),'4a952806d86da0cdaf9f33dd57badcbb776cab3affb2fb5b3a26a3c10702666e');assert.equal(manifest.icons[0].src,'/assets/fia-brand-192.png');
});

test('branded derivatives use opaque official navy and general FIA sharing text',()=>{
 for(const name of ['fia-brand-192.png','fia-512.png','fia-maskable-512.png','fia-apple-180.png','fia-favicon-32.png','fia-share-1200x630.png']){
  const b=readFileSync(new URL('public/assets/'+name,root));assert.equal(b[24],8);assert.equal(b[25],2,'opaque RGB '+name);const chunks=[];for(let pos=8;pos<b.length;){const n=b.readUInt32BE(pos),type=b.subarray(pos+4,pos+8).toString();if(type==='IDAT')chunks.push(b.subarray(pos+8,pos+8+n));pos+=12+n;}const row=inflateSync(Buffer.concat(chunks));assert.deepEqual([...row.subarray(1,4)],[32,44,59],name);
 }
 for(const key of ['og:image:alt','twitter:image:alt'])one(`meta[${key.startsWith('og:')?'property':'name'}="${key}"]`,'content','FIA Guide — Equip Translators. Engage the Word. Transform Communities.');
});
