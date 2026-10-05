import importlib.util, unittest, tempfile, json, wave, hashlib, subprocess, sys, io
from unittest.mock import patch
from pathlib import Path
import numpy as np
spec=importlib.util.spec_from_file_location('signal_measure',Path(__file__).resolve().parents[2]/'server/fia/preparation/executor/signal-measure.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Measurements(unittest.TestCase):
 def test_quiet_midpoint_strict_edges_and_centered_proof(self):
  pcm=np.zeros(16000,dtype=np.float32);r=m.boundary(pcm,.1,.3)
  self.assertEqual(r['state'],'measured');self.assertGreater(r['cutSeconds'],.1);self.assertLess(r['cutSeconds'],.3);self.assertLess(r['centered60msDbfs'],-45);self.assertGreater(r['quietRuns'][0]['startSample'],1600);self.assertLess(r['quietRuns'][0]['endSampleExclusive'],4800)
 def test_loud_short_and_invalid_intervals_block(self):
  self.assertEqual(m.boundary(np.ones(16000,dtype=np.float32),.1,.4)['state'],'blocked');self.assertEqual(m.boundary(np.zeros(16000),.1,.16)['state'],'blocked');self.assertEqual(m.boundary(np.zeros(16000),float('nan'),.4)['state'],'blocked')
 def test_contiguity_no_summing_separate_short_runs(self):
  pcm=np.ones(16000,dtype=np.float32);pcm[1601:2081]=0;pcm[2241:2721]=0;self.assertEqual(m.boundary(pcm,.1,.18)['state'],'blocked')
 def test_unknown_adjacent_word_never_filled(self):
  raw={'segments':[{'words':[{'start':.1,'end':.2},{'start':.5,'end':.6}]}]};a={'mappings':[{'activityId':'a','sourceUnitId':'u','status':'exact-candidate','matchCount':1,'wordSpan':{'first':0,'lastExclusive':1}}]};r=m.measure(np.zeros(16000),raw,a);self.assertEqual(r[0]['reason'],'adjacent-word-envelope-missing')
 def test_full_word_envelopes_and_ambiguity(self):
  raw={'segments':[{'words':[{'start':.01,'end':.1},{'start':.3,'end':.4},{'start':.6,'end':.7}]}]};a={'mappings':[{'activityId':'a','sourceUnitId':'u','status':'exact-candidate','matchCount':1,'wordSpan':{'first':1,'lastExclusive':2}},{'activityId':'b','sourceUnitId':'v','status':'ambiguous-repeated-phrase','matchCount':2}]};r=m.measure(np.zeros(16000),raw,a);self.assertEqual(r[0]['state'],'measured');self.assertEqual(r[0]['left']['searchInterval'],{'startSeconds':.1,'endSeconds':.3});self.assertEqual(r[1]['state'],'blocked')

 def test_chosen_quiet_margins_do_not_include_neighboring_loud_region(self):
  pcm=np.ones(16000,dtype=np.float32);pcm[2001:3281]=0;r=m.boundary(pcm,.1,.4)
  self.assertEqual(r['state'],'measured');q=r['selectedQuietRun'];self.assertAlmostEqual(r['leftMarginSeconds'],(r['cutSample']-q['startSample'])/16000);self.assertLess(r['leftMarginSeconds'],r['envelopeLeftMarginSeconds']);self.assertTrue(all('linearRms' in x for x in r['landmarks']))
 def test_nonfinite_pcm_refuses(self):
  pcm=np.zeros(16000);pcm[2000]=float('nan')
  with self.assertRaisesRegex(ValueError,'nonfinite-pcm'):m.boundary(pcm,.1,.4)
 def test_cli_pinned_decode_and_source_path_mutation_use_hashed_bytes(self):
  import av
  with tempfile.TemporaryDirectory() as directory:
   directory=Path(directory);source=directory/'source.wav'
   with wave.open(str(source),'wb') as writer:writer.setnchannels(1);writer.setsampwidth(2);writer.setframerate(16000);writer.writeframes(bytes(32000))
   source_bytes=source.read_bytes();source_sha=m.digest(source_bytes)
   raw={'schema':'fia-local-raw-recognition@1','source':{'sha256':source_sha},'decoder':{'sha256':m.digest(np.zeros(16000,dtype=np.float32).tobytes()),'samples':16000},'segments':[{'words':[{'start':.01,'end':.1},{'start':.3,'end':.4},{'start':.6,'end':.7}]}]}
   raw_bytes=json.dumps(raw).encode();raw_path=directory/'raw.json';raw_path.write_bytes(raw_bytes)
   alignment={'schema':'fia-exact-word-alignment@1','scriptSha256':'a'*64,'sourceSha256':source_sha,'rawRecognitionSha256':m.digest(raw_bytes),'mappings':[{'activityId':'a','sourceUnitId':'u','sourceTextSha256':'b'*64,'status':'exact-candidate','matchCount':1,'wordSpan':{'first':1,'lastExclusive':2}}]}
   align_bytes=json.dumps(alignment).encode();align_path=directory/'alignment.json';align_path.write_bytes(align_bytes)
   job={'sourcePath':str(source),'sourceSha256':source_sha,'sourceBytes':len(source_bytes),'rawPath':str(raw_path),'rawSha256':m.digest(raw_bytes),'alignmentPath':str(align_path),'alignmentSha256':m.digest(align_bytes)}
   original_open=av.open
   def race_open(value,*args,**kwargs):
    source.write_bytes(b'replaced-after-hash');self.assertIsInstance(value,io.BytesIO);return original_open(value,*args,**kwargs)
   with patch.object(av,'open',race_open):result=m.execute(job)
   self.assertEqual(result['pcm']['samples'],16000);self.assertEqual(result['units'][0]['state'],'measured')
   source.write_bytes(source_bytes);job_path=directory/'input.json';job_path.write_text(json.dumps(job));output=directory/'output.json'
   process=subprocess.run([sys.executable,str(Path(m.__file__)),'--input',str(job_path),'--output',str(output)],capture_output=True,text=True,timeout=10)
   self.assertEqual(process.returncode,0,process.stderr);parsed=json.loads(output.read_text());self.assertEqual(parsed['status'],'candidate');self.assertNotIn('NaN',output.read_text());self.assertNotIn('Infinity',output.read_text())

if __name__=='__main__':unittest.main()
