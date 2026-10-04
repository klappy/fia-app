import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
test('list compiler rejects unreviewed content, changed text, pauses and inserted resources',()=>{
 const result=execFileSync('python3',['-c',`
import sys,json,copy
sys.path.insert(0,'scripts')
from list_contract import compile_lists
guide=json.load(open('public/content/source/guide.json'))
plan=json.load(open('content/list-plan.json'))
activities=json.load(open('src/lib/pack.json'))['activities']
def rejects(g,p,a):
 try: compile_lists(g,p,a)
 except (AssertionError,KeyError): return
 raise AssertionError('Unsafe contract accepted')
assert len(compile_lists(guide,plan,copy.deepcopy(activities)))==4
p=copy.deepcopy(plan);p['lists'].pop();rejects(guide,p,activities)
p=copy.deepcopy(plan);p['lists'][1]['sourceHashes']['S03-U010']='changed';rejects(guide,p,activities)
p=copy.deepcopy(plan);p['lists'][0]['purpose']='descriptive-list';rejects(guide,p,activities)
a=copy.deepcopy(activities);next(x for x in a if x['id']=='S05-U010')['completion']='confirm';rejects(guide,plan,a)
a=copy.deepcopy(activities);next(x for x in a if x['id']=='S05-U010')['assetId']='map';rejects(guide,plan,a)
a=copy.deepcopy(activities);i=next(i for i,x in enumerate(a) if x['id']=='S05-U010');a.insert(i,dict(id='inserted-reading',completion='auto',assetId='scripture'));rejects(guide,plan,a)
a=copy.deepcopy(activities);next(x for x in a if x['id']=='S01-U003')['completion']='auto';rejects(guide,plan,a)
print('validated')
`],{encoding:'utf8'});
 assert.equal(result.trim(),'validated');
});
