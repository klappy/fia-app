import contextlib
import io
import json
import runpy
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from decode import decode_audio

class GeneratorTests(unittest.TestCase):
    def test_decode_rejects_error_even_with_partial_output(self):
        with patch('decode.subprocess.run', side_effect=subprocess.CalledProcessError(1, 'ffmpeg', output=b'partial')) as run:
            with self.assertRaises(subprocess.CalledProcessError): decode_audio('clip.opus')
            self.assertTrue(run.call_args.kwargs['check'])
    def test_decode_rejects_empty_or_incomplete_pcm(self):
        for pcm in (b'', b'x'):
            with patch('decode.subprocess.run', return_value=types.SimpleNamespace(stdout=pcm)):
                with self.assertRaises(ValueError): decode_audio('clip.opus')
        with patch('decode.subprocess.run', return_value=types.SimpleNamespace(stdout=b'\x00\x00')):
            self.assertEqual(decode_audio('clip.opus'), b'\x00\x00')
    def test_spanish_generator_uses_multilingual_asr_and_preserves_accents(self):
        calls=[]
        class Samples:
            def astype(self, *_): return self
            def __truediv__(self, _): return self
        class Model:
            def __init__(self, name, **kwargs): calls.append(name)
            def transcribe(self, samples, **kwargs):
                calls.append(kwargs['language'])
                return [types.SimpleNamespace(words=[types.SimpleNamespace(word='año',start=.1,end=.5)])], None
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            data={'manifest':{'entries':[{'path':'audio.opus','delivery':{'kind':'audio','url':'url','sha256':'abc','duration':1},'source':{'sha256':'original'},'timing':{},'playbackRange':{'startSeconds':0,'endSeconds':1}}]},'pack':{'activities':[{'id':'a','audioSrc':'audio.opus','narration':'año'}]},'urls':['url']}
            argv=['transcribe.py','--language','es','--audio-dir',temp,'--out',str(root/'out')]
            for key,value in data.items():
                path=root/(key+'.json');path.write_text(json.dumps(value));argv+=['--'+key,str(path)]
            numpy=types.SimpleNamespace(frombuffer=lambda *_:Samples(),int16=object(),float32=object())
            with patch.object(sys,'argv',argv), patch.dict(sys.modules,{'numpy':numpy,'faster_whisper':types.SimpleNamespace(WhisperModel=Model)}),patch('decode.decode_audio',return_value=b'\x00\x00'),contextlib.redirect_stdout(io.StringIO()):
                runpy.run_path(str(Path(__file__).with_name('transcribe.py')),run_name='__main__')
            sidecar=json.loads((root/'out/abc.words.json').read_text())
            self.assertEqual(calls,['small','es'])
            self.assertEqual(sidecar['language'],'es')
            self.assertEqual(sidecar['activities']['a']['matched'],1)
            self.assertEqual(sidecar['activities']['a']['words'][0]['text'],'año')

if __name__=='__main__': unittest.main()
