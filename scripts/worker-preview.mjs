// Opt-in local E2E server: actual packaged API authority with Vite's existing
// preview static middleware, including its extensionless HTML and media handling.
import {preview} from 'vite';
import {createControlledAuthority} from './live-listening/controlled-authority.mjs';
import {previewRequest} from './live-listening/preview-request.mjs';
const repo=process.cwd(),port=Number(process.env.FIA_PREVIEW_PORT||4173),localOrigin=`http://127.0.0.1:${port}`,workerOrigin='https://dev.fiaguide.app';
const authority=await createControlledAuthority(repo,workerOrigin);
let server;
try{server=await preview({preview:{host:'127.0.0.1',port,strictPort:true},plugins:[{name:'packaged-worker-authority-preview',configurePreviewServer(server){server.middlewares.use(async(req,res,next)=>{try{
 let target;try{target=previewRequest(req.url,req.headers,localOrigin,workerOrigin);}catch{return void res.writeHead(403).end('Untrusted preview request');}
 const path=new URL(target.url).pathname;
 if(path==='/v1'||path.startsWith('/v1/')||path==='/mcp'||path.startsWith('/mcp/')){const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks),response=await authority.fetch(target.url,{method:req.method,headers:target.headers,...(body.length?{body}:{})});res.writeHead(response.status,Object.fromEntries(response.headers));return void res.end(Buffer.from(await response.arrayBuffer()));}
 if(!['GET','HEAD'].includes(req.method))return void res.writeHead(405,{'Allow':'GET, HEAD'}).end();
 next();
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}});}}]});}catch(error){await authority.dispose();throw error;}
console.log(`Packaged Worker preview ${localOrigin}; snapshot ${authority.snapshotSha256}`);
async function close(){await new Promise(resolve=>server.httpServer.close(resolve));await authority.dispose();}
process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
