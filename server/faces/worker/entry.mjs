import {servePreparation} from '../../fia/preparation/worker.mjs';
import {FiaPreparationJobs as PreparationJobs} from '../../fia/preparation/worker.mjs';
import {createExecutableWorkerOperations,serveApprovedAudioWorker} from '../../fia/preparation/executable-presentation-runtime.mjs';
import {serveRead} from '../http.mjs';
import {serveMcp as serveSdkMcp} from '../mcp.mjs';
import {createLegacyMcpHandler} from 'agents/mcp';
const serveMcp=(req,res,operations)=>serveSdkMcp(req,res,operations,{handle:async(server,request)=>{
 const handler=createLegacyMcpHandler(server,{enableJsonResponse:true,corsOptions:{origin:new URL(request.url).origin}});
 request.signal.addEventListener('abort',()=>{void server.close();},{once:true});
 try{return await handler(request,{},{});}finally{if(request.method!=='GET')await server.close();}
}});
import {createReadOperations} from '../../fia/publication/read-operations.mjs';
import snapshot from './generated/snapshot.json';
import {snapshotStorage} from './snapshot.mjs';
import {createWorker} from './adapter.mjs';
export class FiaPreparationJobs extends PreparationJobs {presentationExecutionCapabilities(){return {snapshot};}}
export default {async fetch(request,env){const approved=await serveApprovedAudioWorker(request,env);if(approved)return approved;const preparation=await servePreparation(request,env);if(preparation)return preparation;const fallback=createReadOperations(snapshotStorage(snapshot,{fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,request.url),{redirect:'manual'}))}));const operations=createExecutableWorkerOperations({env,fallback});return createWorker({origin:env.FIA_API_ORIGIN,operations,serveRead,serveMcp}).fetch(request,env);}};
