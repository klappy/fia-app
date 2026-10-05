"""One fixed public-source request; retain only sanitized proof as CI artifact."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

NAME = 'fia-asr-integration-proof'
SOURCE_SHA = '0f3fa9e77215f5050f9e22b7abee329c47e0e9ff71a5f0c4d248926a8f42268d'
SOURCE_BYTES = 867865
URL = 'https://s3.amazonaws.com/cbbt-er.public/pericopes/eng/mrk/p2/s1/v2/vbr0.mp3'
private = Path('work/asr-private')
proof = Path('work/asr-proof')
private.mkdir(parents=True, exist_ok=False)
proof.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen(URL, timeout=30) as response:
    source = response.read(SOURCE_BYTES + 1)
if len(source) != SOURCE_BYTES or hashlib.sha256(source).hexdigest() != SOURCE_SHA:
    raise RuntimeError('official-source-byte-mismatch')
(private / 'source.mp3').write_bytes(source)
# This client runs separately from the guarded service; it has no provider token.
client = '''import json,sys,urllib.request
mode,deadline=sys.argv[1:]
if mode=='ready':
 request=urllib.request.Request('http://127.0.0.1:8080/ready')
else:
 body=open('/proof-input/source.mp3','rb').read()
 request=urllib.request.Request('http://127.0.0.1:8080/recognize',data=body,headers={'Content-Type':'audio/mpeg','X-Fia-Attempt-Id':'ci-proof-one','X-Fia-Deadline-Ms':deadline,'X-Fia-Ledger':'A','X-Fia-Node-Key':'a'*64,'X-Fia-Revision':'1'})
with urllib.request.urlopen(request,timeout=305 if mode=='recognize' else 2) as response:
 body=response.read(1048577)
 if len(body)>1048576: raise RuntimeError('response-size')
 sys.stdout.buffer.write(body)
'''
def command(args, **options):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **options)
started = time.monotonic()
deadline = str(int(time.time() * 1000) + 390000)
try:
    command(['docker','run','-d','--name',NAME,'--network=none','--memory=8g','--memory-swap=8g','--cpus=2','--pids-limit=64','--mount','type=bind,src='+str(private.resolve())+',dst=/proof-input,readonly','-e','FIA_ASR_ABSOLUTE_DEADLINE_MS='+deadline,'fia-asr-integration-proof'],timeout=30)
    ready = None
    while time.monotonic() - started < 60:
        attempt = subprocess.run(['docker','exec',NAME,'python','-B','-c',client,'ready',deadline],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
        if attempt.returncode == 0:
            ready = json.loads(attempt.stdout)
            break
        running = command(['docker','inspect','--format','{{.State.Running}}',NAME],timeout=5).stdout.strip()
        if running != b'true':
            raise RuntimeError('guarded-service-exited-before-ready')
        time.sleep(.25)
    if ready is None:
        raise RuntimeError('guarded-service-not-ready')
    if ready['schema'] != 'fia-asr-ready@1' or ready['guards']['addressSpaceBytes'] != 4294967296 or ready['guards']['scratchBytes'] != 0 or ready['guards']['scratchPolicy'] != 'landlock-no-filesystem-writes' or ready['guards']['landlockAbi'] < 3 or ready['guards']['anonymousFilesDenied'] is not True:
        raise RuntimeError('guard-receipt-mismatch')
    ready_seconds = time.monotonic() - started
    recognition_started = time.monotonic()
    result = command(['docker','exec',NAME,'python','-B','-c',client,'recognize',deadline],timeout=310).stdout
    if not result or len(result) > 1048576:
        raise RuntimeError('raw-result-size')
    (private / 'raw.json').write_bytes(result)
    (private / 'expected.json').write_text(json.dumps({'sourceSha256':SOURCE_SHA,'sourceBytes':SOURCE_BYTES,**{key:ready[key] for key in ['modelSha256','runtimeSha256','scriptSha256','configSha256']}}))
    command(['node','--input-type=module','-e',"import {readFile} from 'node:fs/promises';import {validateRawRecognition} from './server/fia/preparation/hosted-asr/artifact.mjs';await validateRawRecognition(new Uint8Array(await readFile('work/asr-private/raw.json')),JSON.parse(await readFile('work/asr-private/expected.json','utf8')));"],timeout=10)
    receipt={'schema':'fia-guarded-http-ci-proof@1','status':'raw-candidate-validated','sourceSha256':SOURCE_SHA,'sourceBytes':SOURCE_BYTES,'rawSha256':hashlib.sha256(result).hexdigest(),'rawBytes':len(result),'readySeconds':ready_seconds,'recognitionSeconds':time.monotonic()-recognition_started,'ready':ready,'limits':['CI Linux only; not Cloudflare enforcement or playback acceptance.','Source and raw transcript remain ephemeral and are not uploaded.']}
    (proof / 'guarded-http.json').write_text(json.dumps(receipt,indent=2)+'\n')
except Exception:
    logs = subprocess.run(['docker','logs','--tail','30',NAME],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=10)
    print(logs.stdout[-16384:].decode(errors='replace'))
    raise
finally:
    stopped = subprocess.run(['docker','rm','-f',NAME],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
    check = subprocess.run(['docker','inspect',NAME],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
    (proof / 'cleanup.json').write_text(json.dumps({'removed':stopped.returncode==0,'containerAbsent':check.returncode!=0})+'\n')
    if stopped.returncode != 0 or check.returncode == 0:
        raise RuntimeError('cleanup-not-verified')
