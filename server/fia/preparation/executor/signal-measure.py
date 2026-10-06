"""Pinned local acoustic measurements; never acceptance or confidence calibration."""
import argparse, io, hashlib, importlib.metadata, json, math, platform, signal
from pathlib import Path

RATE=16000
WINDOW=160
MIN_QUIET=960
THRESHOLD_DBFS=-45.0

def digest(value): return hashlib.sha256(value).hexdigest()
def pinned(path, expected, limit):
    path=Path(path)
    if path.stat().st_size>limit: raise ValueError('input-limit')
    value=path.read_bytes()
    if digest(value)!=expected: raise ValueError('input-hash')
    return value

def linear_rms(samples):
    import numpy as np
    if len(samples)==0: raise ValueError('empty-rms-window')
    rms=float(np.sqrt(np.mean(np.square(samples.astype(np.float64)))))
    if not math.isfinite(rms): raise ValueError('nonfinite-pcm')
    return rms

def dbfs(samples):
    return max(-200.0,20*math.log10(max(linear_rms(samples),1e-10)))

def boundary(pcm, lo, hi):
    # Both outer word-envelope edges are excluded, even when sample-aligned.
    result={'state':'blocked','searchInterval':{'startSeconds':lo,'endSeconds':hi},'quietRuns':[],'reason':'no-qualifying-quiet-run'}
    if not (math.isfinite(lo) and math.isfinite(hi) and 0<=lo<hi<=len(pcm)/RATE):
        result['reason']='invalid-interword-interval';return result
    first=math.floor(lo*RATE)+1;last=math.ceil(hi*RATE)-1
    if last-first<MIN_QUIET:
        result['reason']='insufficient-interword-interval';return result
    run=None
    for start in range(first,last-WINDOW+1,WINDOW):
        quiet=dbfs(pcm[start:start+WINDOW])<THRESHOLD_DBFS
        if quiet and run is None: run=start
        if not quiet and run is not None:
            if start-run>=MIN_QUIET:result['quietRuns'].append({'startSample':run,'endSampleExclusive':start})
            run=None
    end=first+((last-first)//WINDOW)*WINDOW
    if run is not None and end-run>=MIN_QUIET:result['quietRuns'].append({'startSample':run,'endSampleExclusive':end})
    for item in result['quietRuns']:
        item.update(startSeconds=item['startSample']/RATE,endSeconds=item['endSampleExclusive']/RATE,maximum10msDbfs=max(dbfs(pcm[start:start+WINDOW]) for start in range(item['startSample'],item['endSampleExclusive'],WINDOW)))
    if not result['quietRuns']:return result
    if len(result['quietRuns'])>1:
        result['reason']='ambiguous-quiet-runs';return result
    chosen=result['quietRuns'][0]
    cut=(chosen['startSample']+chosen['endSampleExclusive'])//2
    proof=pcm[cut-MIN_QUIET//2:cut+MIN_QUIET//2]
    level=dbfs(proof)
    if len(proof)!=MIN_QUIET or level>=THRESHOLD_DBFS:result['reason']='centered-proof-failed';return result
    landmarks=[]
    for offset in range(-3200,3200,WINDOW):
        start=cut+offset
        if start>=0 and start+WINDOW<=len(pcm):landmarks.append({'startSample':start,'endSampleExclusive':start+WINDOW,'offsetSamples':offset,'linearRms':linear_rms(pcm[start:start+WINDOW]),'dbfs':dbfs(pcm[start:start+WINDOW])})
    result['landmarks']=landmarks
    result['selectedQuietRun']=dict(chosen)
    result.update(state='measured',reason=None,cutSample=cut,cutSeconds=cut/RATE,centered60msDbfs=level,leftMarginSeconds=(cut-chosen['startSample'])/RATE,rightMarginSeconds=(chosen['endSampleExclusive']-cut)/RATE,envelopeLeftMarginSeconds=cut/RATE-lo,envelopeRightMarginSeconds=hi-cut/RATE)
    return result

def measure(pcm, raw, alignment):
    words=[word for segment in raw['segments'] for word in segment['words']]
    if len(words)>10000 or len(alignment['mappings'])>1000:raise ValueError('measurement-unit-limit')
    duration=len(pcm)/RATE;prior_start=prior_end=0
    for word in words:
        start,end=word['start'],word['end']
        if not isinstance(start,(int,float)) or not isinstance(end,(int,float)) or not math.isfinite(start) or not math.isfinite(end) or not 0<=start<=end<=duration or start<prior_start or end<prior_end:raise ValueError('invalid-word-envelope')
        prior_start,prior_end=start,end
    units=[]
    for row in alignment['mappings']:
        unit={'activityId':row['activityId'],'sourceUnitId':row['sourceUnitId'],'sourceTextSha256':row.get('sourceTextSha256'),'state':'blocked','reason':'no-unique-exact-mapping'}
        if row['status']=='exact-candidate' and row.get('matchCount')==1:
            span=row['wordSpan'];first,last=span['first'],span['lastExclusive']
            if type(first)is not int or type(last)is not int or not 0<=first<last<=len(words):raise ValueError('invalid-word-span')
            start,end=words[first]['start'],words[last-1]['end']
            if first==0 or last==len(words):unit['reason']='adjacent-word-envelope-missing'
            else:
                left=boundary(pcm,words[first-1]['end'],start);right=boundary(pcm,end,words[last]['start'])
                unit.update(wordSpan=span,envelope={'startSeconds':start,'endSeconds':end},left=left,right=right,state='measured' if left['state']==right['state']=='measured' else 'blocked',reason=None if left['state']==right['state']=='measured' else 'boundary-measurement-incomplete')
        units.append(unit)
    return units

def clock_landmarks(pcm):
    landmarks=[]
    for percent in range(10,100,10):
        anchor=(len(pcm)*percent)//100
        windows=[]
        for offset in range(-3200,3200,WINDOW):
            start=anchor+offset
            if start>=0 and start+WINDOW<=len(pcm):
                samples=pcm[start:start+WINDOW]
                windows.append({'startSample':start,'endSampleExclusive':start+WINDOW,'offsetSamples':offset,'linearRms':linear_rms(samples),'dbfs':dbfs(samples)})
        landmarks.append({'percent':percent,'anchorSample':anchor,'windows':windows})
    return landmarks

def execute(job):
    import av, numpy as np
    if set(job)!={'sourcePath','sourceSha256','sourceBytes','rawPath','rawSha256','alignmentPath','alignmentSha256'}:raise ValueError('invalid-job')
    source=pinned(job['sourcePath'],job['sourceSha256'],2*1024*1024)
    if len(source)!=job['sourceBytes']:raise ValueError('source-length')
    raw=json.loads(pinned(job['rawPath'],job['rawSha256'],4*1024*1024));alignment=json.loads(pinned(job['alignmentPath'],job['alignmentSha256'],4*1024*1024))
    if raw['schema']!='fia-local-raw-recognition@1' or alignment['schema']!='fia-exact-word-alignment@1' or raw['source']['sha256']!=job['sourceSha256'] or alignment['sourceSha256']!=job['sourceSha256'] or alignment['rawRecognitionSha256']!=job['rawSha256']:raise ValueError('artifact-binding')
    with av.open(io.BytesIO(source)) as container:
        if len(container.streams.audio)!=1:raise ValueError('ambiguous-audio-stream')
        stream=container.streams.audio[0];codec=stream.codec_context
        metadata={'codec':codec.name,'sampleRate':codec.sample_rate,'channels':codec.channels,'format':codec.format.name if codec.format else None,'streamStartTime':stream.start_time,'streamDuration':stream.duration,'timeBase':str(stream.time_base),'codecDelay':getattr(codec,'delay',None)}
        resampler=av.AudioResampler(format='fltp',layout='mono',rate=RATE);chunks=[];total=0
        for frame in container.decode(audio=0):
            for output in resampler.resample(frame):
                chunk=output.to_ndarray().reshape(-1);total+=len(chunk)
                if total>600*RATE:raise ValueError('decoded-limit')
                chunks.append(chunk)
        for output in resampler.resample(None):
            chunk=output.to_ndarray().reshape(-1);total+=len(chunk)
            if total>600*RATE:raise ValueError('decoded-limit')
            chunks.append(chunk)
        if not chunks:raise ValueError('empty-source')
        pcm=np.concatenate(chunks).astype(np.float32)
    pcm_sha=digest(pcm.tobytes())
    if raw['decoder']['sha256']!=pcm_sha or raw['decoder']['samples']!=len(pcm):raise ValueError('pcm-reproduction-mismatch')
    return {'schema':'fia-signal-boundary-measurements@1','status':'candidate','sourceSha256':job['sourceSha256'],'rawRecognitionSha256':job['rawSha256'],'alignmentSha256':job['alignmentSha256'],'guideScriptSha256':alignment['scriptSha256'],'pcm':{'sha256':pcm_sha,'samples':len(pcm),'sampleRate':RATE},'policy':{'windowSamples':WINDOW,'thresholdDbfsExclusive':THRESHOLD_DBFS,'minimumQuietSamples':MIN_QUIET,'dbfsFloor':-200,'selection':'single-qualifying-run-only-midpoint'},'sourceMetadata':metadata,'runtime':{'python':platform.python_version(),'av':importlib.metadata.version('av'),'numpy':importlib.metadata.version('numpy')},'scriptSha256':digest(Path(__file__).read_bytes()),'clockLandmarks':clock_landmarks(pcm),'units':measure(pcm,raw,alignment),'limits':['Acoustic measurements only; no calibrated confidence, accepted ranges or browser clock claim.']}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--input',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
    signal.signal(signal.SIGALRM,lambda *_:(_ for _ in ()).throw(TimeoutError('measurement-120s-limit')));signal.alarm(120)
    path=Path(args.input)
    if path.stat().st_size>16384:raise ValueError('job-limit')
    result=execute(json.loads(path.read_text()));body=json.dumps(result,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
    if len(body)>4*1024*1024:raise ValueError('output-limit')
    with Path(args.output).open('xb') as output:output.write(body)
    print(json.dumps({'sha256':digest(body),'bytes':len(body),'units':len(result['units']),'status':'candidate'}))
