import {audioPolicy} from './policy.mjs';
import {readFile} from 'node:fs/promises';
import {JobStore} from '../../core/jobs/store.mjs';
import {localFixtureCapability} from '../../core/budget/fixture.mjs';
import {audioPlan} from './plan.mjs';

// The OS account running this local command is the authority. --operator is audit metadata.
const [command,directory,operator,...args]=process.argv.slice(2);
try {
  if(!command||!directory||!operator)throw Error('usage: cli.mjs <enqueue|execute|status|reconcile|plan|recover-lock> <store-dir> <operator> [arguments]');
  const store=new JobStore(directory,{operator,capability:localFixtureCapability(operator),policy:audioPolicy});
  let result;
  if(command==='enqueue')result=await store.enqueue(args[0],JSON.parse(await readFile(args[1],'utf8')));
  else if(command==='execute')result=await store.execute(args[0]);
  else if(command==='status')result=await store.status(args[0]);
  else if(command==='plan')result=await audioPlan(store,args);
  else if(command==='reconcile') {
    const report=JSON.parse(await readFile(args[1],'utf8'));
    if(report.bytesBase64!==undefined){report.bytes=Buffer.from(report.bytesBase64,'base64');delete report.bytesBase64;}
    result=await store.reconcile(args[0],report);
  } else if(command==='recover-lock'){await store.recoverLock(args[0]);result={recovered:true};}
  else throw Error('unknown-command');
  process.stdout.write(JSON.stringify(result)+'\n');
} catch(error) {process.stderr.write(error.message+'\n');process.exitCode=1;}
