import {mkdir,copyFile,cp,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyInputs} from './verify.mjs';
// Creates a new context only. Never downloads, builds, starts or deploys anything.
export async function prepareBuild(inputs,destination){
 const receipt=await verifyInputs(inputs);const target=resolve(destination);
 await mkdir(target); // Refuse an existing context instead of merging stale bytes.
 for(const directory of ['model','wheels'])await cp(resolve(inputs,directory),resolve(target,directory),{recursive:true,dereference:false});
 // Re-verify copied assets: a changing source cannot enter a trusted build context.
 await verifyInputs(target);
 for(const name of ['Dockerfile','requirements.lock','proposal.json','recognize.py'])await copyFile(new URL(name,import.meta.url),resolve(target,name));
 await writeFile(resolve(target,'input-verification.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{if(process.argv.length!==4)throw Error('usage: prepare-build.mjs INPUT_DIRECTORY NEW_CONTEXT_DIRECTORY');console.log(await prepareBuild(process.argv[2],process.argv[3]));}catch(e){console.error(e.message);process.exitCode=1;}}
