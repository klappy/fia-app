// Read-only upgrade reference: compile the exact old deployed main worker from Git history.
// This file and the generated worker never enter dist or a release runtime.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
export async function legacyWorker(){
 const dir=mkdtempSync(join(tmpdir(),'fia-legacy-worker-'));
 try{for(const name of ['sw.ts','engine.ts','manifest.ts'])writeFileSync(join(dir,name),execFileSync('git',['show',`957a9c53e5f9849d23f0ba17aad46fc36df9ae4c:src/offline/${name}`]));
 const result=await build({entryPoints:[join(dir,'sw.ts')],bundle:true,write:false,format:'iife',define:{'import.meta.env.VITE_FIA_RELEASE':'"0.3.5"'}});return result.outputFiles[0].contents;
 }finally{rmSync(dir,{recursive:true,force:true});}
}
