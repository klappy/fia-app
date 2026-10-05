import {spawn} from 'node:child_process';
// Development process supervisor. Does NOT establish cgroup memory/scratch limits.
export function runBoundedProcess({command,args=[],deadline,now=Date.now,graceMs=1000,maxOutputBytes=1048576}){
 if(typeof command!=='string'||!Array.isArray(args)||!Number.isSafeInteger(deadline)||deadline<=now()||!Number.isInteger(graceMs)||graceMs<1||graceMs>5000)throw Error('invalid-process-deadline');
 const child=spawn(command,args,{shell:false,detached:true,stdio:['ignore','pipe','pipe']});
 let total=0,reason=null,timer,killTimer,settled=false;
 const signal=name=>{try{process.kill(-child.pid,name);}catch(error){if(error.code!=='ESRCH')throw error;}};
 const stop=why=>{if(settled||reason)return;reason=why;signal('SIGTERM');killTimer??=setTimeout(()=>signal('SIGKILL'),graceMs);};
 const completion=new Promise((resolve,reject)=>{
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{total+=bytes.length;if(total>maxOutputBytes)stop('output-limit');});
  child.once('error',error=>{settled=true;clearTimeout(timer);clearTimeout(killTimer);reject(error);});
  child.once('close',(code,signalName)=>{settled=true;clearTimeout(timer);clearTimeout(killTimer);let groupStopped=false;try{process.kill(-child.pid,0);}catch(error){groupStopped=error.code==='ESRCH';}resolve({code,signal:signalName,reason,outputBytes:total,stopVerified:groupStopped});});
 });
 timer=setTimeout(()=>stop('absolute-deadline'),Math.max(0,deadline-now()));
 return {pid:child.pid,completion,stop:()=>{stop('explicit-stop');return completion;}};
}
