import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('packages/views/BORROWED.json',root)));
test('bounded brand/token asset bytes retain recorded source identity',()=>{
 for(const file of manifest.files)assert.equal(createHash('sha256').update(readFileSync(new URL(file.path,root))).digest('hex'),file.sha256);
 assert.equal(manifest.files.length,5);
});
