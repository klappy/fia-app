import test from 'node:test';
import assert from 'node:assert/strict';
import {limitView,zoomAt} from '../src/lib/visual-view.js';
test('pan limits use the fitted image instead of its letterboxed element',()=>{
 const viewport={width:400,height:400}, image={width:800,height:400};
 assert.deepEqual(limitView({zoom:2,x:900,y:900},viewport,image),{zoom:2,x:200,y:0});
 assert.deepEqual(limitView({zoom:1,x:900,y:-900},viewport,image),{zoom:1,x:0,y:0});
 assert.deepEqual(limitView({zoom:20,x:0,y:0},viewport,image),{zoom:6,x:0,y:0});
});
test('zoom preserves the chosen focal point and limits magnification',()=>{
 assert.deepEqual(zoomAt({zoom:1,x:0,y:0},2,{x:50,y:-20}),{zoom:2,x:-50,y:20});
 assert.equal(zoomAt({zoom:2,x:0,y:0},0,{x:0,y:0}).zoom,1);
});
