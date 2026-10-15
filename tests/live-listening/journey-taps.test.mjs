import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Gate law (docs/release-gates/live-listening.md, "Settled face before every primary tap"): the hosted journey taps
// the primary's checked action only through tapPrimary, which waits for the settled face and records the wait.
const spec=readFileSync(new URL('../../e2e/live-listening/journey.spec.js',import.meta.url),'utf8');
const helper=/^async function tapPrimary\(.*$/m;
// Line numbers of .guide-primary clicks made outside tapPrimary, directly or through a name bound to the locator.
function rawPrimaryClicks(source){
 const rest=source.replace(helper,''),line=i=>rest.slice(0,i).split('\n').length;
 const names=[...rest.matchAll(/(\w+)\s*=(?!>)\s*[^;=]*?locator\((['"`])\.guide-primary\2\)/g)].map(m=>m[1]);
 const direct=[...rest.matchAll(/locator\((['"`])\.guide-primary\1\)\.click\(/g)].map(m=>m.index);
 const bound=names.flatMap(n=>[...rest.matchAll(new RegExp(`\\b${n}\\.click\\(`,'g'))].map(m=>m.index));
 return [...direct,...bound].map(line).sort((a,b)=>a-b);
}
test('the detector finds raw primary clicks and leaves named and icon locators alone',()=>{
 assert.deepEqual(rawPrimaryClicks("x;\nawait controls(page).locator('.guide-primary').click();"),[2]);
 assert.deepEqual(rawPrimaryClicks("const cont=async()=>{const b=controls(page).locator('.guide-primary');await expect(b).toHaveAttribute('aria-label','Continue',{timeout:30000});await b.click();};"),[1]);
 assert.deepEqual(rawPrimaryClicks("await controls(page).getByRole('button',{name:'Pause',exact:true}).click();await expect(controls(page).locator('.guide-primary svg.lucide-play')).toHaveCount(1);const progress=page=>page.evaluate(()=>1);"),[]);
 assert.deepEqual(rawPrimaryClicks("async function tapPrimary(page,face){const b=controls(page).locator('.guide-primary');await b.click();}"),[]);
});
test('the hosted journey taps the primary only through tapPrimary',()=>{
 assert.match(spec,helper);assert.deepEqual(rawPrimaryClicks(spec),[],'raw .guide-primary click outside tapPrimary (journey.spec.js lines)');
});
test('tapPrimary waits up to 30 s for the face, records the wait, then taps',()=>{
 const body=spec.match(helper)[0],at=s=>{const i=body.indexOf(s);assert.notEqual(i,-1,s);return i;};
 assert.ok(at("toHaveAttribute('aria-label',face,{timeout:30000})")<at('evidence.primaryTaps.push(')&&at('evidence.primaryTaps.push(')<at('b.click()'));
 assert.match(body,/seen=await b\.getAttribute\('aria-label'\)/);assert.match(body,/waitedMs/);
});
test('every hosted scenario taps through tapPrimary, so each receipt lists primaryTaps',()=>{
 const scenarios=spec.split(/\ntest\(/).slice(1);assert.equal(scenarios.length,5);
 for(const s of scenarios)assert.match(s,/\btapPrimary\(page,/,s.slice(0,s.indexOf(',')));
});
