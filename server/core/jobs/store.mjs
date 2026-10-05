import {mkdir,open,readFile,rename,unlink,rmdir,link} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonical,sha256,bounded} from './codec.mjs';
import {authorize} from '../budget/fixture.mjs';

const states = new Set(['queued','preparing','completed','failed','uncertain']);
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const shape = (value, required, optional=[]) => plain(value) && required.every(key=>Object.hasOwn(value,key)) && Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
export class JobStore {
  constructor(directory, {operator,capability,policy, fault = async()=>{}}) {
    authorize(operator,capability);
    if(!policy || typeof policy.validateRequest!=='function'||typeof policy.validateOutput!=='function'||typeof policy.provider!=='function')throw Error('trusted-policy-required');
    bounded(policy.id,'policy');canonical(policy.outputMetadata);
    this.policy=Object.freeze({...policy,outputMetadata:structuredClone(policy.outputMetadata)});
    this.directory=resolve(directory); this.operator=operator; this.capability=structuredClone(capability); this.fault=fault;
  }
  binding(request) {
    const encoded=canonical(request);
    const metadata=this.policy.validateRequest(structuredClone(request));canonical(metadata);
    return {buildKey:sha256(canonical({policyId:this.policy.id,payload:JSON.parse(encoded)})),metadata};
  }
  async init() { await mkdir(this.directory,{recursive:true,mode:0o700}); }
  async syncDirectory() { const handle=await open(this.directory,'r'); try { await handle.sync(); } finally { await handle.close(); } }
  async atomic(path, bytes) {
    const temporary=join(this.directory,`.tmp-${randomUUID()}`);
    const handle=await open(temporary,'wx',0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    try { await rename(temporary,path); await this.syncDirectory(); }
    finally { await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;}); }
  }
  async locked(action) {
    authorize(this.operator,this.capability); await this.init();
    const lock=join(this.directory,'lock'), token=randomUUID();
    try { await mkdir(lock); } catch(error) { if(error.code==='EEXIST')throw Error('store-busy'); throw error; }
    try {
      await this.atomic(join(lock,'owner.json'),JSON.stringify({token,pid:process.pid}));
      return await action();
    } finally {
      // Never remove a lock that no longer belongs to this process.
      const owner=JSON.parse(await readFile(join(lock,'owner.json'),'utf8'));
      if(owner.token!==token)throw Error('lock-ownership-lost');
      await unlink(join(lock,'owner.json')); await rmdir(lock);
    }
  }
  async recoverLock(token) {
    authorize(this.operator,this.capability); bounded(token,'lock-token');
    const guard=join(this.directory,'recovery-lock');
    try { await mkdir(guard); } catch(error) { if(error.code==='EEXIST')throw Error('recovery-busy');throw error; }
    try {
      const lock=join(this.directory,'lock');
      const owner=JSON.parse(await readFile(join(lock,'owner.json'),'utf8'));
      if(owner.token!==token || !Number.isSafeInteger(owner.pid) || owner.pid<1)throw Error('lock-recovery-refused');
      try { process.kill(owner.pid,0); throw Error('lock-owner-alive'); }
      catch(error) { if(error.code!=='ESRCH')throw error; }
      // Serialized recovery of this dead owner only; no age-based takeover.
      const again=JSON.parse(await readFile(join(lock,'owner.json'),'utf8'));
      if(again.token!==token)throw Error('lock-recovery-refused');
      const retired=join(this.directory,`.retired-lock-${randomUUID()}`);
      await rename(lock,retired); await unlink(join(retired,'owner.json')); await rmdir(retired); await this.syncDirectory();
    } finally { await rmdir(guard); }
  }
  async read() {
    let state;
    try { state=JSON.parse(await readFile(join(this.directory,'state.json'),'utf8')); }
    catch(error) { if(error.code==='ENOENT')return {schema:'fia-fixture-store@1',jobs:{},requests:{}}; throw Error('corrupt-store'); }
    if(!shape(state,['schema','jobs','requests']) || state.schema!=='fia-fixture-store@1' || !plain(state.jobs) || !plain(state.requests))throw Error('corrupt-store');
    for(const [id,job] of Object.entries(state.jobs)) {
      if(!shape(job,['id','operator','key','request','policyId','metadata','buildKey','state','revision','attemptCount','reservation'],['attempt','output','evidence']) || !shape(job.reservation,['monetaryCap','externalCalls','attemptsPerJob']))throw Error('corrupt-store');
      try {bounded(job.operator);bounded(job.key);} catch {throw Error('corrupt-store');}
      if(job.policyId!==this.policy.id)throw Error('policy-mismatch');
      let binding; try { binding=this.binding(job.request); } catch { throw Error('corrupt-store'); }
      if(!validHash(id) || job.id!==id || !states.has(job.state) || !Number.isSafeInteger(job.revision) || job.revision<0 || ![0,1].includes(job.attemptCount) || binding.buildKey!==job.buildKey || canonical(binding.metadata)!==canonical(job.metadata) || job.reservation?.monetaryCap!=='0' || job.reservation?.externalCalls!=='0' || job.reservation?.attemptsPerJob!=='1')throw Error('corrupt-store');
      const requestIndex=sha256(canonical({operator:job.operator,key:job.key}));
      if(state.requests[requestIndex]!==id || sha256(canonical({schema:'fia-fixture-job@1',policyId:job.policyId,operator:job.operator,key:job.key,buildKey:job.buildKey}))!==id)throw Error('corrupt-store');
      if((job.state==='queued')!==(job.attemptCount===0) || (job.attemptCount===1 && (typeof job.attempt!=='string'||!/^[a-f0-9-]{36}$/.test(job.attempt))) || (job.state==='queued' && (job.revision!==0||job.attempt!==undefined||job.output!==undefined||job.evidence!==undefined)) || (job.state!=='queued'&&job.revision<1) || (job.state!=='completed'&&job.output!==undefined) || (job.state==='completed'&&!job.output))throw Error('corrupt-store');
    }
    if(Object.entries(state.requests).some(([key,id])=>!validHash(key)||!state.jobs[id]||key!==sha256(canonical({operator:state.jobs[id].operator,key:state.jobs[id].key}))))throw Error('corrupt-store');
    return state;
  }
  async commit(state) { await this.atomic(join(this.directory,'state.json'),JSON.stringify(state)); }
  owned(state,id) {
    if(!validHash(id) || !state.jobs[id] || state.jobs[id].operator!==this.operator)throw Error('job-unavailable');
    return state.jobs[id];
  }
  async verify(job) {
    const descriptor=job.output;
    if(!shape(descriptor,['outputSha','bytes','metadata']) || !validHash(descriptor.outputSha) || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes<1)throw Error('artifact-unavailable');
    const bytes=await readFile(join(this.directory,`artifact-${descriptor.outputSha}`));
    if(bytes.length!==descriptor.bytes || sha256(bytes)!==descriptor.outputSha)throw Error('artifact-corrupt');
    if(this.policy.validateOutput(structuredClone(job.request),bytes,structuredClone(descriptor.metadata))!==true)throw Error('artifact-binding-mismatch');
    return bytes;
  }
  async enqueue(key,request) {
    bounded(key,'request-key'); const binding=this.binding(request), copy=structuredClone(request);
    return this.locked(async()=>{
      const state=await this.read(), index=sha256(canonical({operator:this.operator,key}));
      const previous=state.requests[index];
      if(previous) {
        const job=this.owned(state,previous);
        if(job.buildKey!==binding.buildKey)throw Error('request-key-conflict');
        if(job.state==='completed')await this.verify(job);
        return this.view(job);
      }
      const id=sha256(canonical({schema:'fia-fixture-job@1',policyId:this.policy.id,operator:this.operator,key,buildKey:binding.buildKey}));
      const job={id,operator:this.operator,key,request:copy,policyId:this.policy.id,...binding,state:'queued',revision:0,attemptCount:0,reservation:{monetaryCap:'0',externalCalls:'0',attemptsPerJob:'1'}};
      state.jobs[id]=job;state.requests[index]=id;await this.commit(state);return this.view(job);
    });
  }
  view(job) { return structuredClone({...job, state:job.state==='preparing'?'uncertain':job.state, ...(job.state==='preparing'?{reason:'attempt-reconciliation-required',persistedState:'preparing'}:{})}); }
  async status(id) { return this.locked(async()=>{const job=this.owned(await this.read(),id);if(job.state==='completed')await this.verify(job);return this.view(job);}); }
  async publish(bytes) {
    const outputSha=sha256(bytes),path=join(this.directory,`artifact-${outputSha}`), temporary=join(this.directory,`.tmp-${randomUUID()}`);
    const handle=await open(temporary,'wx',0o600);
    try { await handle.writeFile(bytes);await handle.sync(); } finally {await handle.close();}
    try {
      try {await link(temporary,path);} catch(error) {if(error.code!=='EEXIST')throw error;}
      const stored=await readFile(path);if(!bytes.equals(stored))throw Error('artifact-corrupt');
      await this.syncDirectory();
    } finally {await unlink(temporary);}
    return {outputSha,bytes:bytes.length,metadata:structuredClone(this.policy.outputMetadata)};
  }
  async execute(id,provider=this.policy.provider) {
    // Injection is a trusted local test seam, not a sandbox for arbitrary code.
    const attempt=await this.locked(async()=>{
      const state=await this.read(),job=this.owned(state,id);
      if(job.state!=='queued')throw Error('attempt-not-permitted');
      job.state='preparing';job.attempt=randomUUID();job.attemptCount=1;job.revision++;
      await this.commit(state);return structuredClone(job);
    });
    await this.fault('after-preparing');
    let result;
    try {result=await provider(structuredClone(attempt.request));}
    catch {return this.finish(attempt,{state:'uncertain',evidence:'fixture-provider-outcome-unknown'});}
    if(result?.kind==='definitive-failure')return this.finish(attempt,{state:'failed',evidence:'fixture-definitive-no-output'});
    if(result?.kind!=='output' || !Buffer.isBuffer(result.bytes) || this.policy.validateOutput(structuredClone(attempt.request),result.bytes,structuredClone(this.policy.outputMetadata))!==true)return this.finish(attempt,{state:'uncertain',evidence:'fixture-output-invalid'});
    return this.locked(async()=>{
      const state=await this.read(),job=this.owned(state,id);this.match(job,attempt);
      const output=await this.publish(result.bytes);await this.fault('after-output');
      job.output=output;job.state='completed';job.revision++;job.evidence='fixture-output-verified';await this.commit(state);return this.view(job);
    });
  }
  match(job,attempt) {if(job.state!=='preparing'||job.attempt!==attempt.attempt||job.revision!==attempt.revision)throw Error('stale-attempt');}
  async finish(attempt,outcome) {return this.locked(async()=>{const state=await this.read(),job=this.owned(state,attempt.id);this.match(job,attempt);Object.assign(job,outcome);job.revision++;await this.commit(state);return this.view(job);});}
  async reconcile(id,report) {
    if(!shape(report,['attempt','revision','outcome','evidence'],['bytes']))throw Error('invalid-reconciliation');
    const {attempt,revision,outcome,bytes,evidence}=report;
    if(!Number.isSafeInteger(revision)||revision<1||typeof attempt!=='string'||(outcome!=='recovered'&&bytes!==undefined))throw Error('invalid-reconciliation');
    bounded(evidence,'evidence');
    return this.locked(async()=>{
      const state=await this.read(),job=this.owned(state,id);
      if(!['preparing','uncertain'].includes(job.state)||job.attempt!==attempt||job.revision!==revision)throw Error('stale-reconciliation');
      if(outcome==='recovered') {
        if(!Buffer.isBuffer(bytes)||this.policy.validateOutput(structuredClone(job.request),bytes,structuredClone(this.policy.outputMetadata))!==true)throw Error('artifact-binding-mismatch');
        job.output=await this.publish(bytes);job.state='completed';
      } else if(outcome==='no-output') job.state='failed';
      else if(outcome==='unresolved')job.state='uncertain';
      else throw Error('invalid-reconciliation');
      job.evidence=evidence;job.revision++;await this.commit(state);return this.view(job);
    });
  }
}