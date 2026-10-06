// Client label map for fia-easy-button-policy@1 actions (packages/contracts/easy-button-policy).
// The contract carries no labels. Copy authority: fia-app-cookbook design/alpha-system/components/primary-button.md.
// These are the en strings of the post-R6 App.svelte label chains (integration/2026-10-06-train @21ad2dc), kept byte-identical so the swap renders nothing new.
// Divergence from the design book: Begin again, Return and Listen are not in primary-button.md.
// After #193 (R4) cancel is never in the primary's slot; `starting` shows the loading row's label.
export const PRIMARY_LABELS = Object.freeze({
 pause:'Pause',
 'begin-again':'Begin again',
 continue:'Continue',
 resume:'Resume',
 'play-video':'Play video',
 play:'Play',
 listen:'Listen',
 return:'Return',
 begin:'Begin',
 // R5 (adopted k0011): no label, accessible name "Checking availability". Used only once R5 lands; @1 clients pin phase verified.
 verifying:'',
 // R4 starting face: the design-book loading row, the label it will have (apps/web/src/lib/easy-button.js easyFace).
 starting:'Pause'
});
const ACCESSIBLE_NAMES=Object.freeze({verifying:'Checking availability'});
export function labelFor(action){
 if(!Object.prototype.hasOwnProperty.call(PRIMARY_LABELS,action))throw new Error(`No primary label for action ${action}`);
 return PRIMARY_LABELS[action];
}
export function accessibleNameFor(action){return ACCESSIBLE_NAMES[action]??labelFor(action);}
