// Read-only deployed gate; run only against the authorized environment after its Git deployment.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const origin=process.env.FIA_API_URL,commit=process.env.EXPECTED_COMMIT;
const expectedVersion=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')).version;
assert.ok(['https://dev.fiaguide.app','https://staging.fiaguide.app','https://fiaguide.app'].includes(origin),'explicit existing environment required');
assert.match(commit||'',/^[a-f0-9]{40}$/,'exact deployed commit required');
const hash=x=>createHash('sha256').update(x).digest('hex'),authority=JSON.parse(readFileSync('server/faces/worker/authority.json'));
const get=async(path,options)=>{const r=await fetch(origin+path,{...options,signal:AbortSignal.timeout(20000)});return r;};
const stamp=await(await get('/version.json',{headers:{'Cache-Control':'no-cache'}})).json();assert.equal(stamp.commit,commit);assert.equal(stamp.version,expectedVersion);
const headers={'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'};
for(const accepted of authority.artifacts){
 const r=await get('/v1/packs/'+accepted.packId);assert.equal(r.status,200);const record=await r.json();assert.equal(hash(JSON.stringify(record)),accepted.envelopeSha256);
 const artifact=await get(record.artifact.path);assert.equal(artifact.status,200);const bytes=Buffer.from(await artifact.arrayBuffer());assert.equal(bytes.length,accepted.bytes);assert.equal(hash(bytes),accepted.sha256);
 const rpc=await get('/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read_pack',arguments:{packId:accepted.packId}}})});assert.equal(rpc.status,200);assert.deepEqual((await rpc.json()).result.structuredContent,record);
}
const absent=await get('/v1/not-a-route',{headers:{'Sec-Fetch-Mode':'navigate'}});assert.equal(absent.status,404);assert.match(absent.headers.get('content-type'),/json/);
assert.equal((await get('/v1/packs/fia-mark-approved-presentation',{headers:{Origin:'https://untrusted.invalid'}})).status,403);
console.log(JSON.stringify({origin,commit,version:stamp.version,acceptedArtifacts:authority.artifacts.length,httpMcp:'pass',unknownRoute:'json404',foreignOrigin:'refused'}));
