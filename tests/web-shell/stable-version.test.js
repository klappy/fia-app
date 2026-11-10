import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStamp,requireStableVersion} from '../../scripts/version-stamp.js';
test('new builds require stable SemVer and preserve matching package/lock identities',()=>{
 for(const version of ['3.0.0-alpha.21','3.0.0-beta.1','3.0.0-rc.1','03.0.0','3.0','3.0.0+untracked'])assert.throws(()=>requireStableVersion(version),/stable SemVer/);
 for(const version of ['3.0.0','3.1.0','4.0.0'])assert.equal(requireStableVersion(version),version);
 const pkg=JSON.parse(readFileSync('package.json')),lock=JSON.parse(readFileSync('package-lock.json'));
 assert.equal(createStamp().version,pkg.version);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
});
