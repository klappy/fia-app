const interactive = 'button,a,input,select,textarea,summary,[contenteditable],.session-progress,.scene-controls,.sheet,dialog,audio,.visual-dialog';

// Passive touch observation leaves scrolling, selection and media gestures native.
export function createSwipeRecognizer() {
 let start = null;
 const cancel = () => { start = null; };
 return {
  cancel,
  begin({x,y,time,count,width,blocked,identity}) {
   cancel();
   if(count!==1||blocked||x<24||x>width-24)return;
   start={x,y,time,identity};
  },
  move({x,y,count}) {
   if(start&&(count!==1||(Math.abs(y-start.y)>12&&Math.abs(y-start.y)>=Math.abs(x-start.x))))cancel();
  },
  end({x,y,time,identity,blocked}) {
   const s=start;cancel();if(!s||blocked||identity!==s.identity)return null;
   const dx=x-s.x,dy=y-s.y,dt=time-s.time;
   if(dt<0||dt>700||Math.abs(dx)<60||Math.abs(dx)<1.5*Math.abs(dy))return null;
   return dx<0?'next':'back';
  }
 };
}

export function swipeNavigation(node, read) {
 const gesture=createSwipeRecognizer();let suppressClick=null;
 const selected=()=>Boolean(window.getSelection()?.toString());
 const blocked=target=>{const role=target?.closest?.('[role="button"]');const video=target?.closest?.('video');return Boolean(target?.closest?.(interactive))||Boolean(role&&!role.matches('.visual-viewport'))||Boolean(target?.closest?.('.visual-explorer.fullscreen'))||Boolean(video?.controls)||selected();};
 const start=e=>{suppressClick=null;const p=e.touches[0];if(!p)return;const s=read();gesture.begin({x:p.clientX,y:p.clientY,time:e.timeStamp,count:e.touches.length,width:window.innerWidth,blocked:s.blocked||blocked(e.target),identity:s.identity});};
 const move=e=>{const p=e.touches[0];if(p)gesture.move({x:p.clientX,y:p.clientY,count:e.touches.length});else gesture.cancel();};
 const end=e=>{const p=e.changedTouches[0];if(!p||e.touches.length){gesture.cancel();return;}const s=read();const direction=gesture.end({x:p.clientX,y:p.clientY,time:e.timeStamp,identity:s.identity,blocked:s.blocked||selected()});if(direction&&s[direction]){suppressClick={x:p.clientX,y:p.clientY,until:performance.now()+800};e.preventDefault();s.navigate(direction);}};
 const click=e=>{const pending=suppressClick;suppressClick=null;if(pending&&performance.now()<=pending.until&&Math.hypot(e.clientX-pending.x,e.clientY-pending.y)<=40){e.preventDefault();e.stopImmediatePropagation();}};
 const newPointer=()=>{suppressClick=null;};
 node.addEventListener('pointerdown',newPointer,true);
 node.addEventListener('click',click,true);
 const handlers={touchstart:start,touchmove:move,touchend:end,touchcancel:gesture.cancel};
 for(const [type,handler] of Object.entries(handlers))node.addEventListener(type,handler,{passive:type!=='touchend'});
 return {destroy(){gesture.cancel();suppressClick=null;node.removeEventListener('click',click,true);node.removeEventListener('pointerdown',newPointer,true);for(const [type,handler] of Object.entries(handlers))node.removeEventListener(type,handler);}};
}

// Only the latest selection can control the loading guard; obsolete work cannot
// keep navigation disabled after a newer selection has completed.
export function createSelectionTracker(onPending){
 let generation=0;
 return ()=>{const owner=++generation;onPending(true);return ()=>{if(owner===generation)onPending(false);};};
}
