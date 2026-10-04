// One animation follows an evolving target; audio ticks never restart browser easing.
export function createSmoothFollow(viewport,request=requestAnimationFrame,cancel=cancelAnimationFrame){
 let frame=null,target=0,last=null;
 function stop(){if(frame!==null)cancel(frame);frame=null;last=null;}
 function step(now){
  frame=null;
  const dt=last===null?16:Math.min(64,Math.max(0,now-last));last=now;
  const distance=target-viewport.scrollTop;
  if(Math.abs(distance)<.5){viewport.scrollTo({top:target,behavior:'instant'});last=null;return;}
  viewport.scrollTo({top:viewport.scrollTop+distance*(1-Math.exp(-dt/150)),behavior:'instant'});
  frame=request(step);
 }
 return {stop,to(top,reduced=false){
  target=Math.max(0,Math.min(viewport.scrollHeight-viewport.clientHeight,top));
  if(reduced){stop();viewport.scrollTo({top:target,behavior:'instant'});return;}
  if(frame===null)frame=request(step);
 }};
}
