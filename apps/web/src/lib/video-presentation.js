// One mounted video owner; native exit events, never orientation, release it.
export function createVideoPresentation({quiesce=()=>{},notice=()=>{},delay=2000,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let current=null,serial=0;
 const read=(node,key)=>{try{return node[key];}catch{return undefined;}};
 function native(owner){return read(owner.node,'webkitDisplayingFullscreen')===true||read(owner.node,'webkitPresentationMode')==='fullscreen'||owner.document?.fullscreenElement===owner.node;}
 function clearWatch(owner){if(owner.timer!==null)clearTimer(owner.timer);owner.timer=null;}
 function release(owner){
  if(current!==owner||native(owner))return;
  clearWatch(owner);owner.state='inline';owner.mode=null;owner.node.pause();quiesce();
  const pending=owner.pending;owner.pending=null;
  if(pending&&current===owner)pending();
 }
 function request(owner){
  if(current!==owner)return;
  owner.state='exiting';owner.node.pause();quiesce();clearWatch(owner);
  owner.timer=setTimer(()=>{if(current===owner&&owner.state==='exiting')notice('Video exit is still pending. Use the video’s Done control, or retry Exit immersive view.');},delay);
  try{
   let result;
   if(owner.document?.fullscreenElement===owner.node&&typeof owner.document.exitFullscreen==='function')result=owner.document.exitFullscreen();
   else if(typeof owner.node.webkitSetPresentationMode==='function')result=owner.node.webkitSetPresentationMode('inline');
   else if(typeof owner.node.webkitExitFullscreen==='function')result=owner.node.webkitExitFullscreen();
   else notice('Use the video’s Done control to return before continuing.');
   Promise.resolve(result).catch(()=>{if(current===owner&&owner.state==='exiting')notice('Video exit is still pending. Use the video’s Done control.');});
  }catch{if(current===owner)notice('Video exit is still pending. Use the video’s Done control.');}
 }
 function register(node,identity){
  dispose();const owner={node,identity,generation:++serial,document:node.ownerDocument,state:'inline',mode:null,pending:null,timer:null};current=owner;
  if(native(owner)){owner.state='native';owner.mode=owner.document?.fullscreenElement===node?'standard':'webkit';}
  const begin=()=>{if(current===owner){if(owner.state!=='exiting')owner.state='native';owner.mode='webkit';}};
  const end=()=>{if(current===owner&&owner.mode==='webkit')release(owner);};
  const mode=()=>{if(current!==owner)return;if(read(node,'webkitPresentationMode')==='fullscreen')begin();else if(read(node,'webkitPresentationMode')==='inline')end();};
  const fullscreen=()=>{if(current!==owner)return;if(owner.document.fullscreenElement===node){owner.state='native';owner.mode='standard';}else if(owner.mode==='standard')release(owner);};
  node.addEventListener('webkitbeginfullscreen',begin);node.addEventListener('webkitendfullscreen',end);node.addEventListener('webkitpresentationmodechanged',mode);owner.document?.addEventListener('fullscreenchange',fullscreen);
  owner.cleanup=()=>{clearWatch(owner);node.removeEventListener('webkitbeginfullscreen',begin);node.removeEventListener('webkitendfullscreen',end);node.removeEventListener('webkitpresentationmodechanged',mode);owner.document?.removeEventListener('fullscreenchange',fullscreen);owner.pending=null;};
  return ()=>{if(current===owner)dispose();else owner.cleanup();};
 }
 function defer(transition,{retry=false}={}){const owner=current;if(!owner)return false;if(owner.state==='inline'&&!native(owner))return false;if(!owner.mode)owner.mode=owner.document?.fullscreenElement===owner.node?'standard':'webkit';owner.pending=transition;if(owner.state!=='exiting'||retry)request(owner);return true;}
 function dispose(){if(current){const owner=current;current=null;owner.cleanup?.();}}
 return {register,defer,dispose,get node(){return current?.node||null;},owns:(node,identity=current?.identity)=>current?.node===node&&current?.identity===identity,get pending(){return !!current?.pending;}};
}
