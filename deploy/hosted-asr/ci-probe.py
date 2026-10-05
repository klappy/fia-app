"""Linux image proof: no recording input, transcription, deployment or network."""
import errno,hashlib,importlib.metadata,json,os,platform,resource,time
from pathlib import Path
started=time.monotonic();assert os.getuid()==65532
proposal=json.loads(Path('/opt/fia/proposal.json').read_text())
for f in proposal['model']['files']:
 p=Path('/opt/model')/f['path'];assert p.stat().st_size==f['bytes'];h=hashlib.sha256()
 with p.open('rb') as stream:
  for chunk in iter(lambda:stream.read(1048576),b''):h.update(chunk)
 assert h.hexdigest()==f['sha256']
assert Path('/sys/fs/cgroup/memory.max').read_text().strip()=='4294967296'
assert Path('/sys/fs/cgroup/memory.swap.max').read_text().strip()=='0'
quota,period=map(int,Path('/sys/fs/cgroup/cpu.max').read_text().split());assert quota/period==2
scratch=Path('/scratch/capacity-proof');written=0
try:
 with scratch.open('wb') as f:
  for _ in range(257):f.write(bytes(1048576));written+=1048576
 raise AssertionError('scratch-quota-not-enforced')
except OSError as e:
 assert e.errno==errno.ENOSPC
finally:scratch.unlink(missing_ok=True)
try:
 Path('/opt/model/write-test').write_bytes(b'x');raise AssertionError('model-writable')
except OSError as e:assert e.errno in (errno.EACCES,errno.EROFS)
from faster_whisper import WhisperModel
model=WhisperModel('/opt/model',device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True)
result={'schema':'fia-linux-image-smoke@1','status':'model-loaded-no-transcription','python':platform.python_version(),'machine':platform.machine(),'runtime':{n:importlib.metadata.version(n) for n in ['faster-whisper','ctranslate2','av','numpy']},'uid':os.getuid(),'memoryLimitBytes':4294967296,'swapLimitBytes':0,'cpuLimit':2,'scratchEnospcAfterBytes':written,'peakProcessRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'elapsedSeconds':time.monotonic()-started,'probeSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'modelRevision':proposal['model']['revision'],'recognizerSha256':hashlib.sha256(Path('/opt/fia/recognize.py').read_bytes()).hexdigest(),'limits':['CI Docker proof only; no Cloudflare readiness, recognition, latency, accepted timing or deployment authority.']}
print(json.dumps(result,sort_keys=True))
