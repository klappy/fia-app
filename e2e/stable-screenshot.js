/** Capture settling is tested, not assumed. Never relax the cross-page comparison. */
export async function stableScreenshot(capture,{limit=8}={}){
 let previous;
 for(let attempts=1;attempts<=limit;attempts++){
  const image=await capture();
  if(previous&&image.equals(previous))return {image,attempts};
  previous=image;
 }
 throw new Error(`Screenshot did not settle within ${limit} captures`);
}
