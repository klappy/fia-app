import {servePreparation} from '../../fia/preparation/worker.mjs';
import {FiaPreparationJobs as PreparationJobs} from '../../fia/preparation/worker.mjs';
import {createExecutableWorkerOperations,serveApprovedAudioWorker} from '../../fia/preparation/executable-presentation-runtime.mjs';
import {serveRead} from '../http.mjs';
import {serveMcp} from '../mcp.mjs';
import {createReadOperations} from '../../fia/publication/read-operations.mjs';
import snapshot from './generated/snapshot.json';
import {snapshotStorage} from './snapshot.mjs';
import {createWorker} from './adapter.mjs';
import {createVisualsPort,serveOriginalVisual} from '../../fia/preparation/visual-publication.mjs';
// The visuals port reads the current executable pointer in-process from this object's own runtime (the authority), so
// publication is fenced on the same executionRevision F5a checks.
const currentOf=ops=>async packId=>{const record=await ops.readPack({packId,execution:'2'});return record?.status==='ready'?record.revision:null;};
export class FiaPreparationJobs extends PreparationJobs {presentationExecutionCapabilities(){return {snapshot,capabilities:{visuals:this.visuals??=createVisualsPort(this.env,{currentRevision:async packId=>currentOf(await this.executionRuntime)(packId)})}};}}
export default {async fetch(request,env){const fallback=createReadOperations(snapshotStorage(snapshot,{fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,request.url),{redirect:'manual'}))}));const operations=createExecutableWorkerOperations({env,fallback});const visual=await serveOriginalVisual(request,env,{currentRevision:currentOf(operations)});if(visual)return visual;const approved=await serveApprovedAudioWorker(request,env);if(approved)return approved;const preparation=await servePreparation(request,env);if(preparation)return preparation;return createWorker({origin:env.FIA_API_ORIGIN,operations,serveRead,serveMcp}).fetch(request,env);}};
