import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {outboundFor} from '../../scripts/live-listening/controlled-authority.mjs';
import {U008_SOURCE_POLICY,u008Sources} from '../../scripts/live-listening/source-policy.mjs';
// The QA-only U008 source policy for the packaged Worker preview. A local stub server stands in for the
// publisher; no test reaches the network. The default stays the refusing outbound service.
const repo=process.cwd(),photo='https://s3.amazonaws.com/cbbt-er.public/media/photos/a1400/1000.jpg',map='https://s3.amazonaws.com/cbbt-er.public/media/maps/eng/c4/v1/original.png';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function stub(){
 const routes=new Map(),seen=[];
 const server=createServer((req,res)=>{seen.push({method:req.method,url:req.url});const r=routes.get(req.url);if(!r){res.writeHead(404).end('no');return;}res.writeHead(r.status,r.headers);res.end(r.body);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 // The policy's own fetch, sent to the stub: same path, same method, same redirect mode.
 const fetch=(url,init)=>globalThis.fetch(`http://127.0.0.1:${port}${new URL(url).pathname}`,init);
 return {routes,seen,fetch,close:()=>new Promise(resolve=>server.close(resolve))};
}
const policy=async(s,observed=[])=>({outbound:await outboundFor(repo,U008_SOURCE_POLICY,{fetch:s.fetch,observe:o=>observed.push(o)}),observed});

test('by default every outbound request is refused, and an unknown policy name is refused',async()=>{
 const outbound=await outboundFor(repo,null);
 assert.throws(()=>outbound(new Request(photo)),/forbids outbound requests/);
 const unset=await outboundFor(repo,undefined);assert.throws(()=>unset(new Request(map)),/forbids outbound requests/);
 await assert.rejects(outboundFor(repo,'everything'),/Unknown source policy/);
});

test('the policy lists exactly the two first-proof originals with their source pins',async()=>{
 const sources=await u008Sources(repo);
 assert.deepEqual(sources.map(s=>[s.assetId,s.url]),[['a1400',photo],['c4',map]]);
 assert.ok(sources.every(s=>/^FIA(Images|Maps)@[a-f0-9]{40}:/.test(s.sourceVersion)));
});

test('an allowed URL passes through byte for byte, by exact match only, and is recorded',async()=>{
 const s=await stub(),body=Buffer.from('jpeg original bytes');
 try{
  s.routes.set('/cbbt-er.public/media/photos/a1400/1000.jpg',{status:200,headers:{'Content-Type':'image/jpeg','ETag':'"x"'},body});
  const {outbound,observed}=await policy(s);
  const response=await outbound(new Request(photo));
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.equal(response.headers.get('content-length'),String(body.length));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),body,'no substituted bytes');
  assert.equal(observed.length,1);assert.equal(observed[0].outcome,'fetched');assert.equal(observed[0].sha256,sha(body));assert.equal(observed[0].bytes,body.length);assert.equal(observed[0].mime,'image/jpeg');assert.equal(observed[0].assetId,'a1400');assert.match(observed[0].expectedSourceVersion,/^FIAImages@/);
  assert.deepEqual(s.seen,[{method:'GET',url:'/cbbt-er.public/media/photos/a1400/1000.jpg'}]);
  // A publisher error is passed through unchanged, never turned into success.
  const missing=await outbound(new Request(map));assert.equal(missing.status,404);assert.equal(observed[1].outcome,'fetched');assert.equal(observed[1].status,404);
 }finally{await s.close();}
});

test('a non-listed URL, a non-GET, a query, a credential header and a redirect are refused; nothing else is fetched',async()=>{
 const s=await stub();
 try{
  s.routes.set('/cbbt-er.public/media/maps/eng/c4/v1/original.png',{status:302,headers:{Location:'https://elsewhere.invalid/c4.png'},body:''});
  const {outbound,observed}=await policy(s);
  const cases=[
   [new Request('https://s3.amazonaws.com/cbbt-er.public/media/photos/a1401/1000.jpg'),/url-not-listed/],
   [new Request('https://s3.amazonaws.com/cbbt-er.public/'),/url-not-listed/],
   [new Request('https://example.invalid/media/photos/a1400/1000.jpg'),/url-not-listed/],
   [new Request(photo+'?x=1'),/url-not-listed|query-not-allowed/],
   [new Request(photo,{method:'POST',body:'x'}),/method-not-get/],
   [new Request(photo,{method:'HEAD'}),/method-not-get/],
   [new Request(photo,{headers:{Authorization:'Bearer x'}}),/credential-header/],
   [new Request(photo,{headers:{Cookie:'a=b'}}),/credential-header/],
  ];
  for(const [request,reason] of cases)await assert.rejects(outbound(request),reason,request.method+' '+request.url);
  assert.deepEqual(s.seen,[],'no refused request reaches the publisher');
  await assert.rejects(outbound(new Request(map)),/redirect-not-followed/);
  assert.deepEqual(s.seen,[{method:'GET',url:'/cbbt-er.public/media/maps/eng/c4/v1/original.png'}],'the redirect is not followed');
  s.routes.set('/cbbt-er.public/media/maps/eng/c4/v1/original.png',{status:200,headers:{'Content-Type':'image/png',Location:'https://elsewhere.invalid/'},body:'png'});
  await assert.rejects(outbound(new Request(map)),/redirect-not-followed/,'a Location header on any answer is refused');
  assert.ok(observed.every(o=>o.outcome==='refused'));assert.equal(observed.length,cases.length+2);
 }finally{await s.close();}
});
