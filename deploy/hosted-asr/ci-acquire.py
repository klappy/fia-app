"""Bounded CI acquisition of exactly the reviewed public model bytes; no audio."""
import hashlib,json,sys,urllib.request
from pathlib import Path
root=Path(__file__).parent;lock=json.loads((root/'inputs.lock.json').read_text())
assert lock['model']=='Systran/faster-whisper-small' and lock['revision']=='536b0662742c02347bc0e980a01041f333bce120'
out=Path(sys.argv[1]);(out/'model').mkdir(parents=True);(out/'wheels').mkdir()
assert {f['path'] for f in lock['files']}=={'model.bin','config.json','tokenizer.json','vocabulary.txt'}
for item in lock['files']:
 url='https://huggingface.co/'+lock['model']+'/resolve/'+lock['revision']+'/'+item['path']
 h=hashlib.sha256();total=0
 with urllib.request.urlopen(url,timeout=60) as response,(out/'model'/item['path']).open('xb') as target:
  while True:
   chunk=response.read(1024*1024)
   if not chunk:break
   total+=len(chunk)
   if total>item['bytes']:raise ValueError('model-size-overflow')
   h.update(chunk);target.write(chunk)
 if total!=item['bytes'] or h.hexdigest()!=item['sha256']:raise ValueError('model-byte-pin')
print(json.dumps({'modelFiles':len(lock['files']),'bytes':sum(f['bytes'] for f in lock['files']),'status':'verified'}))
