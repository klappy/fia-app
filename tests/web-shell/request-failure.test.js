import test from 'node:test';import assert from 'node:assert/strict';
import {isNavigationBeaconCancellation as allowed} from '../../e2e/request-failure.js';
const observed={url:'https://dev.fiaguide.app/cdn-cgi/rum?',method:'POST',errorText:'net::ERR_ABORTED',expectedOrigin:'https://dev.fiaguide.app',navigating:true};
test('classifies only the observed platform beacon cancelled during navigation',()=>{assert.equal(allowed(observed),true);assert.equal(allowed({...observed,url:'https://staging.fiaguide.app/cdn-cgi/rum?',expectedOrigin:'https://staging.fiaguide.app'}),true);});
test('keeps app failures and other beacon failures fatal',()=>{
 for(const delta of [{navigating:false},{method:'GET'},{errorText:'net::ERR_FAILED'},{errorText:'net::ERR_CONNECTION_RESET'},{url:'https://dev.fiaguide.app/audio/source/S01-U001.mp3'},{url:'https://dev.fiaguide.app/cdn-cgi/rum/other'},{url:'https://dev.fiaguide.app/cdn-cgi/rum?other=1'},{url:'https://other.example/cdn-cgi/rum?'},{url:'http://dev.fiaguide.app/cdn-cgi/rum?'},{url:'not a URL'}])assert.equal(allowed({...observed,...delta}),false,JSON.stringify(delta));
});
