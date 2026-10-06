import {assertPlayback,assertCancellation} from './assert-observation.mjs';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const required=new Map([
 ['P2 automatic Begin and Next preserve first unit and advance native audio',['firstUnitPlayed','singlePauseActs','nextPlayed']],
 ['P2 Scripture ON must deliver actual BSB playback',['scripturePlayed']],
 ['P2 pending cancellation and OFF to ON cannot resurrect playback',['pendingObserved','noResurrection']],
 ['P2 manual prepare ready then explicit Play has one working Pause',['pendingObserved','readySilent','singlePauseActs','explicitPlay']],
 ['P2 settings and place persist without hidden writes or surprise sound',['preferencesPersisted','placePersisted']]
]);
const origins={dev:'https://dev.fiaguide.app',staging:'https://staging.fiaguide.app',production:'https://fiaguide.app'};
export function verify(report,{commit,environment,readAttachment=path=>readFileSync(path,'utf8')}={}){
 const errors=[];if(!/^[a-f0-9]{40}$/.test(commit||''))errors.push('Full expected commit required');if(!origins[environment])errors.push('Known environment required');
 if(report.errors?.length)errors.push('Runner errors');
 const specs=[];function walk(s){specs.push(...(s.specs||[]));for(const child of s.suites||[])walk(child);}walk(report);
 for(const [title,claims] of required){const found=specs.filter(s=>s.title===title);if(found.length!==1){errors.push(`Missing/duplicate scenario: ${title}`);continue;}
 const tests=found[0].tests||[];if(tests.length!==1||tests[0].projectName!=='live-chromium'){errors.push(`Wrong project: ${title}`);continue;}const results=tests[0].results||[];
 if(results.length!==1||results[0].status!=='passed'||tests[0].expectedStatus==='failed'){errors.push(`Scenario did not pass once: ${title}`);continue;}
 const attached=results[0].attachments?.filter(a=>a.name==='live-listening-evidence')||[];if(attached.length!==1){errors.push(`Missing evidence: ${title}`);continue;}
 try{const a=attached[0];const e=JSON.parse(a.body?Buffer.from(a.body,'base64').toString():readAttachment(a.path));
 if(e.schemaVersion!==1||e.outcome!=='passed'||e.expectedCommit!==commit||e.networkVersion?.commit!==commit||e.environment!==environment||e.origin!==origins[environment]||e.loadedRelease!==`${e.networkVersion?.version}+${commit.slice(0,7)}`||e.packId!=='eng.MRK-1-14-20')throw Error('Wrong candidate, loaded shell, origin or pack');
 if(!e.claims?.firstUnitVisible||claims.some(c=>e.claims[c]!==true))throw Error('Missing asserted outcome');
 if(e.observations?.some(o=>o.kind==='pageerror'))throw Error('Application error');
 const minimum=claims.includes('nextPlayed')?2:claims.includes('scripturePlayed')||claims.includes('explicitPlay')?1:0;
 if(!Array.isArray(e.nativePlayback)||e.nativePlayback.length<minimum)throw Error('Missing real media clock evidence');
 const sequence=claims.includes('nextPlayed')?['S01-U001','S01-U002']:claims.includes('scripturePlayed')?['S01-U002-reading-1']:claims.includes('explicitPlay')?['S01-U001']:[];
 if(e.nativePlayback.length!==sequence.length)throw Error('Wrong native sample count');
 if(claims.includes('noResurrection'))assertCancellation(e.cancellation||{});
 for(const [index,sample] of e.nativePlayback.entries()){if(sample.currentActivityId!==sequence[index])throw Error('Wrong canonical activity sequence');const activeIndex=sample.media?.findIndex(a=>!a.paused);const m=sample.media?.[activeIndex],before=sample.before?.[activeIndex],after=sample.after?.[activeIndex];if(!m||!before||!after||m.src!==before.src||m.src!==after.src||m.before!==before.time||m.after!==after.time)throw Error('Unbound native clock owner');assertPlayback({expected:sample.binding,currentActivityId:sample.currentActivityId,media:sample.media,controls:sample.controls});if(!sample.after?.some((a,i)=>!a.paused&&a.readyState>=2&&a.src&&a.src===sample.before?.[i]?.src&&a.time-sample.before[i].time>=0.25))throw Error('Media clock did not advance');}
 }catch(error){errors.push(`${title}: ${error.message}`);}
 }
 return {ok:errors.length===0,environment,commit,errors,scope:'Live Chromium P2 listening only; no physical-device or audible-output claim'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=verify(JSON.parse(readFileSync(process.argv[2],'utf8')),{commit:process.env.EXPECT_COMMIT,environment:process.env.FIA_ENVIRONMENT});console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}
