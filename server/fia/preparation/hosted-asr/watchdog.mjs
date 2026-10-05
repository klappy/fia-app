import {spawn} from 'node:child_process';
// Development process supervisor. Does NOT establish cgroup memory/scratch limits.
export function runBoundedProcess({command,args=[],deadline,now=Date.now,graceMs=1000,maxOutputBytes=1048576}){
 if(typeof command!=='string'||!Array.isArray(args)||args.some(x=>typeof x!=='string')||!Number.isSafeInteger(deadline)||deadline<=now()||!Number.isInteger(graceMs)||graceMs<1||graceMs>5000||!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1)throw Error('invalid-process-deadline');
 const child=spawn(command,args,{shell:false,detached:true,stdio:['ignore','pipe','pipe']});
 let total=0,reason=null,timer,killTimer,pollTimer,finalTimer,settled=false,closed=null,resolveCompletion,rejectCompletion;
 const signalErrors=[];
 const absent=()=>{if(!child.pid)return false;try{process.kill(-child.pid,0);return false;}catch(error){return error.code==='ESRCH';}};
 const signal=name=>{try{if(child.pid)process.kill(-child.pid,name);}catch(error){if(error.code!=='ESRCH')signalErrors.push(error.code||String(error));}};
 const completion=new Promise((resolve,reject)=>{resolveCompletion=resolve;rejectCompletion=reject;});
 const finish=verified=>{if(settled)return;settled=true;for(const handle of [timer,killTimer,pollTimer,finalTimer])clearTimeout(handle);resolveCompletion({code:closed?.code??null,signal:closed?.signal??null,reason,outputBytes:total,stopVerified:verified,signalErrors});};
 const poll=()=>{if(settled)return;if(absent()&&closed)return finish(true);pollTimer=setTimeout(poll,20);};
 const stop=why=>{if(settled||reason)return;reason=why;signal('SIGTERM');killTimer=setTimeout(()=>{signal('SIGKILL');poll();},graceMs);finalTimer=setTimeout(()=>finish(absent()),graceMs+1000);};
 for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{total+=bytes.length;if(total>maxOutputBytes)stop('output-limit');});
 child.once('error',error=>{if(settled)return;settled=true;for(const handle of [timer,killTimer,pollTimer,finalTimer])clearTimeout(handle);rejectCompletion(error);});
 child.once('close',(code,signalName)=>{closed={code,signal:signalName};if(absent())finish(true);else{stop('surviving-process-group');poll();}});
 timer=setTimeout(()=>stop('absolute-deadline'),Math.max(0,deadline-now()));
 return {pid:child.pid,completion,stop:()=>{stop('explicit-stop');return completion;}};
}
