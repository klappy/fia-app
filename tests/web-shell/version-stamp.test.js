import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createStamp,versionStamp} from '../../scripts/version-stamp.js';
const workers='a'.repeat(40),github='b'.repeat(40);
test('full source commit preserves explicit build environment precedence',()=>{
 assert.equal(createStamp({WORKERS_CI_COMMIT_SHA:workers,GITHUB_SHA:github}).commit,workers);
 assert.equal(createStamp({GITHUB_SHA:github}).commit,github);
 assert.equal(createStamp({}).commit,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());
});
test('invalid preferred commit refuses instead of silently choosing another identity',()=>{
 for(const value of ['abc1234','A'.repeat(40),'g'.repeat(40),'a'.repeat(41),' '+workers])assert.throws(()=>createStamp({WORKERS_CI_COMMIT_SHA:value,GITHUB_SHA:github}),/full source commit/);
 assert.throws(()=>createStamp({GITHUB_SHA:'short'}),/full source commit/);
});
test('document full commit and legacy label come from exactly the emitted version JSON stamp',()=>{
 const env={WORKERS_CI_COMMIT_SHA:workers,GITHUB_SHA:github,WORKERS_CI_BRANCH:'fixture'},plugin=versionStamp(env);
 env.WORKERS_CI_COMMIT_SHA=github;
 const tags=plugin.transformIndexHtml(),files=[];plugin.generateBundle.call({emitFile:file=>files.push(file)});
 assert.equal(files.length,1);assert.equal(files[0].fileName,'version.json');const stamp=JSON.parse(files[0].source);
 const full=tags.filter(t=>t.attrs.name==='fia-source-commit'),legacy=tags.filter(t=>t.attrs.name==='fia-release');
 assert.equal(full.length,1);assert.equal(full[0].attrs.content,workers);assert.equal(full[0].attrs.content,stamp.commit);assert.equal(full[0].injectTo,'head');
 assert.equal(legacy.length,1);assert.equal(legacy[0].attrs.content,`${stamp.version}+${stamp.commit.slice(0,7)}`);
});
