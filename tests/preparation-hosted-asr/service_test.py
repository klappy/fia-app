"""Local service protocol fixtures. No model, source media, or enforcement claim."""
import email.message
import importlib.util
import io
from pathlib import Path
import unittest

BASE = Path(__file__).resolve().parents[2] / 'deploy/hosted-asr'
spec = importlib.util.spec_from_file_location('service', BASE / 'service.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

class ServiceTests(unittest.TestCase):
    def headers(self):
        h = email.message.Message()
        for k, v in {'Content-Length': str(s.SOURCE_BYTES), 'Content-Type': 'audio/mpeg',
                     'X-Fia-Attempt-Id': 'attempt-1', 'X-Fia-Deadline-Ms': '1791234567890',
                     'X-Fia-Ledger': 'A', 'X-Fia-Node-Key': 'a'*64, 'X-Fia-Revision': '1'}.items():
            h[k] = v
        return h
    def test_exact_private_request(self):
        self.assertEqual(s.validate_request(self.headers(), 1791234567890, 1791234567000), 1791234567890)
    def test_duplicate_and_transfer_encoding(self):
        for key,value in [('Content-Length',str(s.SOURCE_BYTES)),('Transfer-Encoding','chunked')]:
            h=self.headers();h[key]=value
            with self.assertRaises(ValueError):s.validate_request(h,1791234567890,1791234567000)
    def test_bad_scope_deadline_and_commands(self):
        for key,value in [('X-Fia-Ledger','caller-key'),('X-Fia-Attempt-Id','$(command)'),('X-Fia-Node-Key','x'),('X-Fia-Revision','0'),('X-Fia-Deadline-Ms','1791234567891'),('Content-Length','2097153')]:
            h=self.headers();h.replace_header(key,value)
            with self.assertRaises(ValueError):s.validate_request(h,1791234567890,1791234567000)
    def test_boot_deadline_not_extendable(self):
        for value in ['', 'NaN','1791234567000','1791235767001']:
            with self.assertRaises(ValueError):s.deadline_from_env({'FIA_ASR_ABSOLUTE_DEADLINE_MS':value},1791234567000)
    def test_metadata_aggregate_limit(self):
        reader=s.HeaderReader(io.BytesIO(b'x'*16385))
        with self.assertRaises(ValueError):reader.readline(65537)
    def test_unsupported_platform_guards_fail_closed(self):
        import platform
        if platform.system()=='Linux':self.skipTest('Linux guard needs isolated nonroot proof process')
        guard=s.load('guards','service-guards.py')
        with self.assertRaisesRegex(RuntimeError,'requires-linux-amd64-nonroot'):guard.enforce()

    def test_actual_http_one_shot_with_explicit_synthetic_bytes(self):
        import hashlib,http.client,threading
        original_bytes,original_sha=s.SOURCE_BYTES,s.SOURCE_SHA
        s.SOURCE_BYTES=4;s.SOURCE_SHA=hashlib.sha256(b'test').hexdigest()
        calls=[]
        state={'deadline':1791234567890,'used':False,'ready':{'schema':'fixture'},
               'start':lambda:calls.append('start'),'done':lambda:calls.append('done'),
               'recognize':lambda body:b'{"synthetic":true}'}
        # Use a real future deadline independent of the fixed request-schema examples.
        import time
        state['deadline']=int(time.time()*1000)+10000
        server=s.HTTPServer(('127.0.0.1',0),s.handler_for(state))
        thread=threading.Thread(target=server.serve_forever);thread.start()
        try:
            headers=dict(self.headers().items());headers['Content-Length']='4';headers['X-Fia-Deadline-Ms']=str(state['deadline'])
            conn=http.client.HTTPConnection(*server.server_address);conn.request('POST','/recognize',b'test',headers);response=conn.getresponse();self.assertEqual(response.status,200);self.assertEqual(response.read(),b'{"synthetic":true}');conn.close()
            conn=http.client.HTTPConnection(*server.server_address);conn.request('POST','/recognize',b'test',headers);response=conn.getresponse();self.assertEqual(response.status,409);response.read();conn.close()
            self.assertEqual(calls,['start','done'])
        finally:
            server.shutdown();thread.join();server.server_close();s.SOURCE_BYTES=original_bytes;s.SOURCE_SHA=original_sha
    def test_independent_watchdog_kills_process_at_absolute_deadline(self):
        import subprocess,sys
        code="import importlib.util,time; spec=importlib.util.spec_from_file_location('s',"+repr(str(BASE/'service.py'))+"); s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s);s.watchdog(time.time()*1000+100);time.sleep(10)"
        result=subprocess.run([sys.executable,'-B','-c',code],timeout=3,capture_output=True)
        self.assertEqual(result.returncode,-9)

if __name__=='__main__':unittest.main()
