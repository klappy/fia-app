<script>
 import {onMount} from 'svelte';
 import {limitView,zoomAt} from '../lib/visual-view.js';
 let {asset,fullscreen=false,onexpand=()=>{}}=$props();
 let viewport=$state(), picture=$state(), view=$state({zoom:1,x:0,y:0}), failed=$state(false), dragging=$state(false);
 let size={width:0,height:0}, natural={width:0,height:0};const pointers=new Map();let gesture=null;
 function apply(next){view=fullscreen?limitView(next,size,natural):{zoom:1,x:0,y:0};}
 $effect(()=>{fullscreen;view={zoom:1,x:0,y:0};});
 function measure(){if(!viewport)return;const r=viewport.getBoundingClientRect();size={width:r.width,height:r.height};natural={width:picture?.naturalWidth||size.width,height:picture?.naturalHeight||size.height};apply(view);}
 function point(e){const r=viewport.getBoundingClientRect();return {x:e.clientX-r.left-r.width/2,y:e.clientY-r.top-r.height/2};}
 function rebase(){const ps=[...pointers.values()];gesture=ps.length>1?{view:{...view},center:{x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2},distance:Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y)}:ps.length?{view:{...view},point:ps[0]}:null;dragging=!!gesture;}
 function expand(){viewport.focus();onexpand();}
 function down(e){if(e.target.closest?.('button'))return;if(e.button!==undefined&&e.button!==0)return;if(!fullscreen){expand();return;}pointers.set(e.pointerId,point(e));viewport.setPointerCapture?.(e.pointerId);rebase();}
 function move(e){if(!fullscreen||!pointers.has(e.pointerId))return;pointers.set(e.pointerId,point(e));const ps=[...pointers.values()];
  if(ps.length>1&&gesture?.distance){const center={x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2};const distance=Math.hypot(ps[1].x-ps[0].x,ps[1].y-ps[0].y);const next=zoomAt(gesture.view,gesture.view.zoom*distance/gesture.distance,gesture.center);apply({...next,x:next.x+center.x-gesture.center.x,y:next.y+center.y-gesture.center.y});}
  else if(gesture?.point&&view.zoom>1)apply({...view,x:gesture.view.x+ps[0].x-gesture.point.x,y:gesture.view.y+ps[0].y-gesture.point.y});
 }
 function up(e){pointers.delete(e.pointerId);rebase();}
 function open(e){if(!fullscreen&&!e.target.closest?.('button'))expand();}
 function zoom(amount){apply(zoomAt(view,view.zoom+amount,{x:0,y:0}));}
 function reset(){apply({zoom:1,x:0,y:0});}
 function key(e){if(!fullscreen&&['Enter',' ','+','=','-','0','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();expand();return;}if(['+','=','-','0','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(e.key==='+'||e.key==='=')zoom(.5);else if(e.key==='-')zoom(-.5);else if(e.key==='0')reset();else apply({...view,x:view.x+(e.key==='ArrowLeft'?60:e.key==='ArrowRight'?-60:0),y:view.y+(e.key==='ArrowUp'?60:e.key==='ArrowDown'?-60:0)});}}
 onMount(()=>{measure();const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):null;observer?.observe(viewport);
  const wheel=e=>{e.preventDefault();if(!fullscreen){expand();return;}apply(zoomAt(view,view.zoom*Math.exp(-e.deltaY*.002),point(e)));};viewport.addEventListener('wheel',wheel,{passive:false});
  return()=>{observer?.disconnect();viewport.removeEventListener('wheel',wheel);};
 });
</script>
<div class="visual-explorer" class:fullscreen>
 <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (Focusable image region provides keyboard zoom/pan equivalents to pointer gestures.) -->
 <div bind:this={viewport} class="visual-viewport" class:dragging role={fullscreen?'region':'button'} aria-label={fullscreen?`Explore ${asset.title}`:`Open ${asset.title} full screen`} tabindex="0" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onlostpointercapture={up} onkeydown={key} onclick={open} style:cursor={view.zoom>1?(dragging?'grabbing':'grab'):'zoom-in'}>
  <img bind:this={picture} src={asset.src} alt={asset.description||asset.title} draggable="false" onload={measure} onerror={()=>failed=true} style:transform={`translate(${view.x}px,${view.y}px) scale(${view.zoom})`}/>
  {#if failed}<div class="media-error">This visual couldn’t load.<button onclick={()=>{failed=false;picture.src=asset.src;}}>Try again</button></div>{/if}
 </div>
 <span class="sr-only" aria-live="polite">{Math.round(view.zoom*100)}% zoom</span>
</div>
