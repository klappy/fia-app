// Opt-in local E2E server: exact packaged authority plus actual built static bytes.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {createControlledAuthority} from './live-listening/controlled-authority.mjs';
import {previewRequest} from './live-listening/preview-request.mjs';
const repo=process.cwd(),port=Number(process.env.FIA_PREVIEW_PORT||4173),localOrigin=`http://127.0.0.1:${port}`,workerOrigin='https://dev.fiaguide.app';
const authority=await createControlledAuthority(repo,workerOrigin),root=resolve(repo,'dist');
const server=createServer(async(req,res)=>{try{
 let target;try{target=previewRequest(req.url,req.headers,localOrigin,workerOrigin);}catch{return void res.writeHead(403).end('Untrusted preview request');}
 const path=new URL(target.url).pathname;
 if(path==='/v1'||path.startsWith('/v1/')||path==='/mcp'||path.startsWith('/mcp/')){const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks),response=await authority.fetch(target.url,{method:req.method,headers:target.headers,...(body.length?{body}:{})});res.writeHead(response.status,Object.fromEntries(response.headers));return void res.end(Buffer.from(await response.arrayBuffer()));}
 let file=resolve(root,'.'+path);if(file!==root&&!file.startsWith(root+'/'))return void res.writeHead(403).end();
 try{if((await stat(file)).isDirectory())file=join(file,'index.html');await stat(file);}catch{file=join(root,'index.html');}
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.mp4':'video/mp4'};
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(await readFile(file));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
server.on('error',async error=>{console.error(error);await authority.dispose();process.exitCode=1;});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});console.log(`Packaged Worker preview ${localOrigin}; snapshot ${authority.snapshotSha256}`);
async function close(){await new Promise(resolve=>server.close(resolve));await authority.dispose();}
process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
