import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareAccepted,operationId} from '../../server/fia/preparation/service.mjs';
import {sha256,canonicalJSONString} from '../../server/fia/preparation/contract.mjs';
test('published p2 admission verifies immutable result and all referenced evidence',async()=>{
 const row=JSON.parse(await readFile(new URL('../../server/fia/preparation/catalog.json',import.meta.url))).entries[0];
 const read=path=>readFile(new URL('../../apps/web/public'+path,import.meta.url));
 const result=await prepareAccepted(row,async path=>new Response(await read(path)));
 assert.equal(result.state,'ready');assert.equal(result.result.activities.length,8);
 assert.equal(result.resultSha256,'186956fb526a0671025180f637c0f6e6b336129085e21951da6e59e89b33fcee');
 assert.equal(await operationId(row),'898b1fb574ae8f5b36dee25e22e9576e51cad0eef9c0c839adf0bd5115e26d16');
 for(const digest of Object.values(result.result.evidence)){
  const bytes=await read(`/content/prepared-audio-evidence/${digest}.json`);assert.equal(await sha256(bytes),digest);assert.equal(bytes.toString(),canonicalJSONString(JSON.parse(bytes)));
 }
 await assert.rejects(prepareAccepted(row,async()=>new Response('changed')));
});
