import json,pathlib,hashlib
import sys
p=pathlib.Path(sys.argv[1]); out=pathlib.Path(__file__).resolve().parents[2];j=lambda f:json.loads((p/f).read_text());sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
raw=(p/'src/lib/pack.json').read_bytes();assert hashlib.sha256(raw).hexdigest()=='ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975'
pack=j('src/lib/pack.json');g=j('public/content/source/guide.json');units={u['id']:u for s in g['steps'] for u in s['units']};scriptures={ 'scripture-'+s['resourceCode']:s for s in j('public/content/source/scripture.json')};audio={a['id']:a for a in j('public/content/source/audio-manifest.json')['entries']};resources={r['content_id']:r for r in j('public/content/source/resources.json')}
b={'id':'fia-mark-full-text','revision':'b2-full-text-71ba5327','schemaVersion':2,'recipeIdentity':'bundled-passage-v1@2','language':'en','title':pack['title'],'cookbookRevision':'71ba5327ad877951b59731ba79087ac92f7256ca','recipe':'product/guidance/bundled-passage-v1.md','source':{'prototypeRevision':'0af90274f13b32a776466e436cd114e6de759783','packFileSha256':hashlib.sha256(raw).hexdigest(),'upstream':pack['source']},'sections':pack['sections'],'activities':[],'resources':{},'lists':[{k:v for k,v in l.items() if k!='narration'} for l in pack['listContracts']],'sourceUnits':[]}
for a in pack['activities']:
 u=units.get(a.get('sourceUnitId') or a.get('fulfills'));s=scriptures.get(a.get('assetId')) if a['kind']=='scripture' else None
 text='\n'.join(v['text'] for v in s['verses']) if s else u['text'];e=audio.get(a.get('audioId'));item={k:a[k] for k in ['id','kind','title','completion','sectionId','sectionTitle','sourceUnitId','fulfills','assetId','relatedAssetIds','availableAssetIds'] if k in a}
 item.update(label=a['eyebrow'],text=text,textSha256=sha(text),sourceSha256=e.get('sourceSha256') if s and e else u['sha256'],attribution=s['rights'].get('resourceTitle',a['eyebrow']) if s else 'FIA Translation Guide © 2025 Word Collective · CC BY-SA 4.0',audio={'status':'unavailable','reason':'Audio is unavailable pending applicability review.','suppliedEvidence':e})
 if s:item['scriptureSource']={k:s[k] for k in ['resourceCode','source','rights','verses']}
 b['activities'].append(item)
for id,a in pack['assets'].items():
 r=resources.get(a.get('sourceRecord'));s=scriptures.get(id);v={k:a[k] for k in ['id','kind','title','subtitle','source','sourceRecord','description','text','relatedIds','verses'] if k in a};v['mediaStatus']='unavailable'
 if r:v['sourceEvidence']={k:r[k] for k in ['content_id','source','rights']};v['sourceContentSha256']=r['source'].get('contentSha256')
 if s:v['sourceEvidence']={k:s[k] for k in ['source','rights','resourceCode','verses']}
 v['audioEvidence']=audio.get('term-'+id) or audio.get(id);v['textSha256']=sha(v.get('text',v.get('description','')));b['resources'][id]=v
pause={'S02-U012':'S02-U011','S06-U005':'S06-U004','S06-U007':'S06-U006','S06-U009':'S06-U008'};optional={x['id'] for x in pack['examples']};production={'S05-U044','S05-U045'}
for id,u in units.items():
 disposition='optional-example' if id in optional else 'production-request' if id in production else 'source-detail' if id in pause else 'default'
 b['sourceUnits'].append({'id':id,'text':u['text'],'sourceSha256':u['sha256'],'textSha256':sha(u['text']),'disposition':disposition,'activityIds':[a['id'] for a in b['activities'] if a.get('sourceUnitId')==id or a.get('fulfills')==id],'associatedActivityId':pause.get(id,'S05-U043' if id in production else None)})
assert len(b['activities'])==128 and len(b['sourceUnits'])==130
(out/'apps/web/public/content/bundle.json').write_text(json.dumps(b,ensure_ascii=False,indent=2)+'\n')
# Portable evidence fixture, no old runtime.
f=out/'tests/web-shell/fixtures';f.mkdir(exist_ok=True)
evidence={'trace':[{k:a[k] for k in ['id','kind','completion','sectionId','sourceUnitId','fulfills','assetId','relatedAssetIds','availableAssetIds'] if k in a} for a in pack['activities']],'units':list(units.values()),'scriptures':list(scriptures.values()),'lists':b['lists'],'resourceIds':list(pack['assets'])}
(f/'canonical-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
