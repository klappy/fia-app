export function limitView(view, viewport, image) {
 const zoom=Math.max(1,Math.min(6,view.zoom));
 if(!viewport.width||!viewport.height||!image.width||!image.height)return {zoom,x:0,y:0};
 const fit=Math.min(viewport.width/image.width,viewport.height/image.height);
 const maxX=Math.max(0,(image.width*fit*zoom-viewport.width)/2);
 const maxY=Math.max(0,(image.height*fit*zoom-viewport.height)/2);
 return {zoom,x:maxX?Math.max(-maxX,Math.min(maxX,view.x)):0,y:maxY?Math.max(-maxY,Math.min(maxY,view.y)):0};
}
export function zoomAt(view, zoom, point) {
 zoom=Math.max(1,Math.min(6,zoom));const ratio=zoom/view.zoom;
 return {zoom,x:point.x-(point.x-view.x)*ratio,y:point.y-(point.y-view.y)*ratio};
}
