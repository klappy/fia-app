import {serveBundledVisual} from '../../fia/preparation/bundled-visual-publication.mjs';
import {servePreparation} from '../../fia/preparation/worker.mjs';
import {FiaPreparationJobs as PreparationJobs} from '../../fia/preparation/worker.mjs';
import {createExecutableWorkerOperations,serveApprovedAudioWorker} from '../../fia/preparation/executable-presentation-runtime.mjs';
import {serveRead} from '../http.mjs';
import {serveMcp} from '../mcp.mjs';
import {createReadOperations} from '../../fia/publication/read-operations.mjs';
import snapshot from './generated/snapshot.json';
import {snapshotStorage} from './snapshot.mjs';
import {createWorker} from './adapter.mjs';
export class FiaPreparationJobs extends PreparationJobs {presentationExecutionCapabilities(){return {snapshot};}}
export default {async fetch(request,env){const approved=await serveApprovedAudioWorker(request,env);if(approved)return approved;const bundled=await serveBundledVisual(request,env,{currentRevision:packId=>snapshot.current?.[packId],currentPresentation:async packId=>{const authority=snapshotStorage(snapshot,{fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'}))}),record=authority.readCatalog(packId);if(record.status!=='ready')return null;const artifact=await authority.findArtifact(record.revision);if(!artifact?.content)return null;return {revision:record.revision,assets:JSON.parse(artifact.content).assets};}});if(bundled)return bundled;const preparation=await servePreparation(request,env,{visualSnapshot:snapshot});if(preparation)return preparation;const fallback=createReadOperations(snapshotStorage(snapshot,{fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,request.url),{redirect:'manual'}))}));const operations=createExecutableWorkerOperations({env,fallback});return createWorker({origin:env.FIA_API_ORIGIN,operations,serveRead,serveMcp}).fetch(request,env);}};
