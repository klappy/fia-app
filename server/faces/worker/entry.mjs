import {serveRead} from '../http.mjs';
import {serveMcp} from '../mcp.mjs';
import {createReadOperations} from '../../fia/publication/read-operations.mjs';
import snapshot from './generated/snapshot.json';
import {snapshotStorage} from './snapshot.mjs';
import {createWorker} from './adapter.mjs';
export default {fetch(request,env){const operations=createReadOperations(snapshotStorage(snapshot,{fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,request.url),{redirect:'manual'}))}));return createWorker({origin:env.FIA_API_ORIGIN,operations,serveRead,serveMcp}).fetch(request,env);}};
