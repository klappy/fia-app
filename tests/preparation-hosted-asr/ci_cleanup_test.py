import json
import os
from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / 'deploy/hosted-asr/ci-service-proof.py'
CID = 'a' * 64
READY = {'schema':'fia-asr-ready@1','guards':{'addressSpaceBytes':4294967296,'scratchBytes':0,'scratchPolicy':'landlock-no-filesystem-writes','landlockAbi':7,'anonymousFilesDenied':True}}
class CleanupTest(unittest.TestCase):
    def exercise(self, daemon_status=0, remaining=b''):
        calls=[]
        def run(args, **kwargs):
            calls.append(args)
            if args[:2] == ['docker','run']: out,status=CID.encode(),0
            elif args[:2] == ['docker','exec']:
                self.assertEqual(args[-2], 'ready');out,status=json.dumps(READY).encode(),0
            elif args[:3] == ['docker','rm','-f']: out,status=CID.encode(),0
            elif args[:3] == ['docker','container','inspect']:
                self.assertEqual(args[-1],CID);out,status=b'',1
            elif args[:3] == ['docker','container','ls']: out,status=remaining,daemon_status
            else: raise AssertionError('unexpected process: '+repr(args))
            return subprocess.CompletedProcess(args,status,out,b'')
        original=os.getcwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                with patch('subprocess.run',run),patch('sys.argv',[str(SCRIPT),'--cleanup-only']),patch('urllib.request.build_opener',side_effect=AssertionError('source fetch forbidden')):
                    if daemon_status or remaining:
                        with self.assertRaisesRegex(RuntimeError,'cleanup-not-verified'):runpy.run_path(str(SCRIPT),run_name='__main__')
                    else:runpy.run_path(str(SCRIPT),run_name='__main__')
                receipt=json.loads(Path('work/asr-proof/cleanup.json').read_text())
                self.assertEqual(receipt['containerAbsent'],not bool(daemon_status or remaining))
                self.assertFalse(Path('work/asr-private/source.mp3').exists())
                self.assertFalse(Path('work/asr-private/raw.json').exists())
            finally:os.chdir(original)
        return calls
    def test_image_name_cannot_satisfy_container_inspection(self):
        calls=self.exercise();self.assertFalse(any(c[:2]==['docker','inspect'] for c in calls))
    def test_daemon_failure_is_not_absence(self):self.exercise(daemon_status=1)
    def test_stopped_container_still_refuses_cleanup(self):self.exercise(remaining=(CID+'\n').encode())
if __name__=='__main__':unittest.main()
