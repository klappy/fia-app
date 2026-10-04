import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../src/lib/engine.js';
import {saveProgress,restoreProgress,LEGACY_STORE} from '../src/lib/session-store.js';
const acts=[{id:'a'},{id:'b'}],pack={id:'fia-mark-authentic',revision:'1'};
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};};
test('migrates legacy progress without playing and writes stable per-pack activity identity',()=>{const s=storage(),session={...createSession(acts),index:1,status:'playing'};s.setItem(LEGACY_STORE,JSON.stringify({session,muted:true}));const value=restoreProgress(s,pack,acts);assert.equal(value.session.index,1);assert.equal(value.session.status,'paused');saveProgress(s,pack,acts,value);assert.equal(restoreProgress(s,{...pack,revision:'2'},[acts[1],acts[0]]).session.index,0);});
test('pack positions are independent while device listening settings carry across packs',()=>{const s=storage();saveProgress(s,pack,acts,{session:{...createSession(acts),index:1},muted:true,dark:true});const other={id:'fixture-second',revision:'1'};const fresh=restoreProgress(s,other,acts);assert.equal(fresh.session.index,0);assert.equal(fresh.muted,true);saveProgress(s,other,acts,{...fresh,session:{...fresh.session,index:0}});assert.equal(restoreProgress(s,pack,acts).session.index,1);});
test('missing stable activity requests restart instead of restoring an unrelated index',()=>{const s=storage();saveProgress(s,pack,acts,{session:{...createSession(acts),index:1}});assert.equal(restoreProgress(s,{...pack,revision:'2'},[acts[0]]).resetRequired,true);});
