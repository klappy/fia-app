import {readFileSync,mkdtempSync,rmSync,existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';

export const referenceManifest=JSON.parse(readFileSync('tests/parity-reference/manifest.json','utf8'));
export function verifyReference(){
 for(const [root,entries] of [['tests/parity-reference/source',referenceManifest.sourceFiles],['apps/web',referenceManifest.sharedFiles]])for(const file of entries){
  const bytes=readFileSync(resolve(root,file.path));
  if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error(`Reference identity mismatch: ${root}/${file.path}`);
 }
}
export async function startReference(){
 verifyReference();
 const output=mkdtempSync(join(tmpdir(),'fia-reference-'));
 try{
  await build({configFile:false,root:resolve('tests/parity-reference/source'),publicDir:false,base:'/',plugins:[svelte()],build:{outDir:output,emptyOutDir:true},logLevel:'warn'});
 }catch(error){rmSync(output,{recursive:true,force:true});throw error;}
 const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.mp4':'video/mp4','.woff2':'font/woff2'};
 const shared=new Set(referenceManifest.sharedFiles.map(f=>'/'+f.path.replace(/^public\//,'')));
 const server=createServer((req,res)=>{
  const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=shared.has(path)?resolve('apps/web/public','.'+path):resolve(output,'.'+(path==='/'?'/index.html':path));
  if((!file.startsWith(output+'/')&&!shared.has(path))||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {url:`http://127.0.0.1:${server.address().port}`,close:async()=>{await new Promise(r=>server.close(r));rmSync(output,{recursive:true,force:true});}};
}
