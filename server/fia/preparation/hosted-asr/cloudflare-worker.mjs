import {DurableObject} from 'cloudflare:workers';
import {createCloudflarePilot} from './cloudflare.mjs';
import {loadActivation} from './activation.mjs';
export class FiaAsrContainerDevelopment extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.pilot=createCloudflarePilot({ctx,env,loadActivation});}
 pilotA(){return this.pilot.pilotA();}
 pilotB(){return this.pilot.pilotB();}
 reconcileA(receipt){return this.pilot.reconcileA(receipt);}
 reconcileB(receipt){return this.pilot.reconcileB(receipt);}
 alarm(){return this.pilot.alarm();}
 fetch(){return this.pilot.fetch();}
}
export default {fetch(){return new Response('Not Found',{status:404});}};
