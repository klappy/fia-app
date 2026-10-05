import test from 'node:test';import assert from 'node:assert/strict';
import {demoVideoSource} from '../src/lib/video-demo.js';
const pack={id:'eng.MRK-1-1-13',revision:'ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975'},asset={id:'a13',src:'/assets/jordan-river.mp4'};
test('HQ demo requires explicit flag and approved demo host',()=>{
 for(const hostname of ['fiaguide.app','localhost','evil.test','dev.fiaguide.app.evil.test'])assert.equal(demoVideoSource(pack,asset,{enabled:'true',hostname}),null);
 assert.equal(demoVideoSource(pack,asset,{enabled:'false',hostname:'dev.fiaguide.app'}),null);
 for(const hostname of ['dev.fiaguide.app','staging.fiaguide.app'])assert.equal(demoVideoSource(pack,asset,{enabled:'true',hostname}),'https://s3.amazonaws.com/cbbt-er.public/media/videos/a13/720p.mp4');
});
test('HQ demo requires exact reviewed pack revision and logical asset binding',()=>{
 const options={enabled:'true',hostname:'dev.fiaguide.app'};
 for(const p of [{...pack,id:'other'},{...pack,revision:'x'}])assert.equal(demoVideoSource(p,asset,options),null);
 for(const a of [{...asset,id:'a10'},{...asset,src:'/other.mp4'}])assert.equal(demoVideoSource(pack,a,options),null);
});
