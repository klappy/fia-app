// The easy button's face, one state machine (cookbook RECIPE R4-R6):
// verifying until availability is known, then the verified action; one
// starting face from an accepted Play until sound (or a truthful failure).
export const CHECKING_LABEL='Checking availability';
// A tap this soon after the last accepted start is part of the same burst.
export const START_BURST_MS=800;
// A check that cannot finish (no service worker answer, a hung request) stops
// verifying after this long and shows what is known; later answers still apply.
export const CHECK_DEADLINE_MS=4000;
const PRESS_FRESH_MS=1000;
const QUEUEABLE=new Set(['Begin','Play','Resume','Play video','Listen']);

export function easyFace({verifying,starting,label}){
 if(verifying)return {kind:'verifying',label:CHECKING_LABEL};
 // Design-book loading row: the label it will have, with a spinner, not actionable.
 if(starting)return {kind:'starting',label:'Pause'};
 return {kind:'action',label};
}

// Only a checked play action carries a tap queued while verifying (E4).
export function queueable(label){return QUEUEABLE.has(label);}

// Tap bookkeeping kept apart from App state: the face a person pressed, the
// one tap queued while verifying, and the start burst that absorbs repeats.
export function createTapGate({burstMs=START_BURST_MS,onburst=()=>{},now=()=>globalThis.performance?.now?.()??Date.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
 let pressed=null,queued=false,timer=null;
 return {
  press(kind){pressed={kind,at:now()};},
  // What the person saw when they pressed, so label and handler agree across a race.
  seen(kind){const press=pressed;pressed=null;return press&&now()-press.at<PRESS_FRESH_MS?press.kind:kind;},
  queue(){queued=true;},
  take(){const value=queued;queued=false;return value;},
  drop(){queued=false;},
  get queued(){return queued;},
  absorb(){clearTimer(timer);onburst(true);timer=setTimer(()=>{timer=null;onburst(false);},burstMs);},
  // The start the burst protected is over (canceled, replaced or ended).
  end(){if(timer===null)return;clearTimer(timer);timer=null;onburst(false);},
  dispose(){clearTimer(timer);timer=null;pressed=null;queued=false;onburst(false);},
 };
}
