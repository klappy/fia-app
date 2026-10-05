import {audioPolicy,fixtureBytes,fixtureProvider,requestBinding} from '../../server/fia/audio/policy.mjs';
import {appendFile,writeFile} from 'node:fs/promises';
import {JobStore} from '../../server/core/jobs/store.mjs';
import {localFixtureCapability} from '../../server/core/budget/fixture.mjs';
const [directory,id,mode]=process.argv.slice(2);
const store=new JobStore(directory,{operator:'test',capability:localFixtureCapability('test'),policy:audioPolicy,fault:async phase=>{
  if((mode==='crash-preparing'&&phase==='after-preparing')||(mode==='crash-output'&&phase==='after-output'))process.exit(77);
}});
try {
  if(mode==='status')console.log(JSON.stringify(await store.status(id)));
  else console.log(JSON.stringify(await store.execute(id,async request=>{
    await appendFile(`${directory}/calls`,'called\n');
    await writeFile(`${directory}/entered`,'yes');
    await new Promise(resolve=>setTimeout(resolve,80));
    return fixtureProvider(request);
  })));
} catch(error){console.error(error.message);process.exitCode=1;}
