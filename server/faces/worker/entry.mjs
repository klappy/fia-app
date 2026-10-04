import {serveRead} from '../http.mjs';
import {serveMcp} from '../mcp.mjs';
import {createReadOperations} from '../../fia/publication/read-operations.mjs';
import snapshot from './generated/snapshot.json';
import {snapshotStorage} from './snapshot.mjs';
import {createWorker} from './adapter.mjs';
const operations=createReadOperations(snapshotStorage(snapshot));
export default {fetch(request,env){return createWorker({origin:env.FIA_API_ORIGIN,operations,serveRead,serveMcp}).fetch(request,env);}};
