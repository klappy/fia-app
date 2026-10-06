// Client label map for fia-easy-button-policy@1 actions (packages/contracts/easy-button-policy).
// The contract carries no labels. Copy authority: fia-app-cookbook design/alpha-system/components/primary-button.md.
// These are today's en strings from App.svelte:91 and :216 (main @3d3b1d2), kept byte-identical so the swap renders nothing new.
// Divergence from the design book: Begin again, Cancel loading, Return and Listen are not in primary-button.md;
// they retire or move with #216 R4 (starting state, cancel leaves the primary's slot) and R5 (verifying state).
export const PRIMARY_LABELS = Object.freeze({
 'cancel-loading':'Cancel loading',
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
 verifying:''
});
const ACCESSIBLE_NAMES=Object.freeze({verifying:'Checking availability'});
export function labelFor(action){
 if(!Object.prototype.hasOwnProperty.call(PRIMARY_LABELS,action))throw new Error(`No primary label for action ${action}; starting is reserved for #216 R4.`);
 return PRIMARY_LABELS[action];
}
export function accessibleNameFor(action){return ACCESSIBLE_NAMES[action]??labelFor(action);}
