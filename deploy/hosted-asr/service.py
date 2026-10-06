"""Private one-attempt Container HTTP service. No public auth or deployment entry."""
import errno
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import signal
import time

MAX_METADATA = 16384
SOURCE_BYTES = 867865
SOURCE_SHA = '0f3fa9e77215f5050f9e22b7abee329c47e0e9ff71a5f0c4d248926a8f42268d'


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def deadline_from_env(env, now_ms):
    value = env.get('FIA_ASR_ABSOLUTE_DEADLINE_MS', '')
    if not re.fullmatch('[0-9]{13}', value):
        raise ValueError('absolute-deadline-required')
    deadline = int(value)
    if not now_ms < deadline <= now_ms + 1200000:
        raise ValueError('invalid-absolute-deadline')
    return deadline


def validate_request(headers, boot_deadline, now_ms):
    # Header identifiers fence one trusted attempt; they are never command arguments.
    required = ['Content-Length', 'Content-Type', 'X-Fia-Attempt-Id', 'X-Fia-Deadline-Ms',
                'X-Fia-Ledger', 'X-Fia-Node-Key', 'X-Fia-Revision']
    if any(len(headers.get_all(key, [])) != 1 for key in required) or headers.get('Transfer-Encoding') is not None:
        raise ValueError('ambiguous-request-headers')
    if headers['Content-Length'] != str(SOURCE_BYTES) or headers['Content-Type'] != 'audio/mpeg':
        raise ValueError('fixed-source-required')
    if not re.fullmatch('[A-Za-z0-9_-]{1,128}', headers['X-Fia-Attempt-Id']) or headers['X-Fia-Ledger'] not in ('A', 'B'):
        raise ValueError('invalid-attempt')
    if not re.fullmatch('[a-f0-9]{64}', headers['X-Fia-Node-Key']) or not re.fullmatch('[1-9][0-9]{0,14}', headers['X-Fia-Revision']):
        raise ValueError('invalid-fence')
    if not re.fullmatch('[0-9]{13}', headers['X-Fia-Deadline-Ms']):
        raise ValueError('invalid-request-deadline')
    deadline = int(headers['X-Fia-Deadline-Ms'])
    if not now_ms < deadline or deadline != boot_deadline:
        raise ValueError('expired-or-extended-deadline')
    if headers.get('X-Fia-Source-Sha256', SOURCE_SHA) != SOURCE_SHA:
        raise ValueError('unapproved-source')
    return deadline


def watchdog(absolute_ms):
    # Independent process can kill a native call even if Python's GIL is stuck.
    read_fd, write_fd = os.pipe()
    parent = os.getpid()
    child = os.fork()
    if child:
        os.close(read_fd)
        return write_fd, child
    os.close(write_fd)
    phase = 0
    absolute = min(time.monotonic() + 390, time.monotonic() + (absolute_ms - time.time() * 1000) / 1000)
    deadline = min(absolute, time.monotonic() + 60)
    try:
        while True:
            ready, _, _ = select.select([read_fd], [], [], max(0, deadline - time.monotonic()))
            if not ready:
                os.kill(parent, signal.SIGKILL)
                break
            message = os.read(read_fd, 1)
            if not message:
                break
            expected = [b'R', b'S', b'D']
            if phase >= 3 or message != expected[phase]:
                os.kill(parent, signal.SIGKILL)
                break
            deadline = min(absolute, time.monotonic() + [30, 300, 30][phase])
            phase += 1
    finally:
        os._exit(0)


class HeaderReader:
    def __init__(self, stream):
        self.stream, self.bytes = stream, 0
    def readline(self, size=-1):
        data = self.stream.readline(min(size if size >= 0 else MAX_METADATA + 1, MAX_METADATA + 1 - self.bytes))
        self.bytes += len(data)
        if self.bytes > MAX_METADATA:
            raise ValueError('metadata-limit')
        return data
    def __getattr__(self, name):
        return getattr(self.stream, name)


def handler_for(state):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.0'
        def setup(self):
            super().setup()
            self.connection.settimeout(10)
            self.rfile = HeaderReader(self.rfile)
        def log_message(self, *_):
            pass
        def handle_one_request(self):
            try:
                super().handle_one_request()
            except (ValueError, TimeoutError):
                self.close_connection = True
        def reply(self, status, body):
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True
        def do_GET(self):
            if self.path != '/ready' or time.time() * 1000 >= state['deadline']:
                return self.reply(404, b'{}')
            self.reply(200, json.dumps(state['ready'], sort_keys=True).encode())
        def do_POST(self):
            if self.path != '/recognize':
                return self.reply(404, b'{}')
            if state['used']:
                return self.reply(409, b'{"error":"attempt-already-consumed"}')
            try:
                deadline = validate_request(self.headers, state['deadline'], time.time() * 1000)
            except ValueError:
                return self.reply(400, b'{"error":"invalid-request"}')
            # A validated admission consumes the single slot even on bad bytes/failure.
            state['used'] = True
            state['start']()
            self.connection.settimeout(min(10, max(0.001, (deadline - time.time() * 1000) / 1000)))
            try:
                raw = self.rfile.read(SOURCE_BYTES)
                if len(raw) != SOURCE_BYTES or hashlib.sha256(raw).hexdigest() != SOURCE_SHA:
                    raise ValueError('source-identity')
                body = state['recognize'](raw)
                if time.time() * 1000 >= deadline or not isinstance(body, bytes) or len(body) > 1048576:
                    raise ValueError('result-limit-or-deadline')
                self.reply(200, body)
            except Exception:
                self.reply(422, b'{"error":"recognition-failed"}')
            finally:
                state['done']()
    return Handler


def main():
    boot_deadline = deadline_from_env(os.environ, time.time() * 1000)
    guards = load('service_guards', 'service-guards.py').enforce()
    pipe, child = watchdog(boot_deadline)
    recognizer_module = load('recognize', 'recognize.py')
    model = recognizer_module.load_model()
    import inspect
    import importlib.metadata
    import platform
    defaults = {key: value.default for key, value in inspect.signature(model.transcribe).parameters.items() if key != 'audio'}
    locked = json.loads(Path(__file__).with_name('transcribe-defaults.json').read_text())
    if recognizer_module.canonical(defaults) != recognizer_module.canonical(locked):
        raise RuntimeError('transcribe-defaults-drift')
    defaults.update({'language': 'en', 'task': 'transcribe', 'beam_size': 5, 'word_timestamps': True,
                     'initial_prompt': None, 'prefix': None, 'hotwords': None,
                     'condition_on_previous_text': False, 'vad_filter': False})
    runtime = {'python': platform.python_version(), 'packages': {name: importlib.metadata.version(name) for name in ['faster-whisper', 'ctranslate2', 'av', 'numpy']}}
    sample = json.loads(recognizer_module.encode_result([], 1, '0' * 64, runtime, defaults))
    ready = {'schema': 'fia-asr-ready@1', **{key: sample[key] for key in ['modelSha256', 'runtimeSha256', 'scriptSha256', 'configSha256']}, 'guards': guards}
    state = {'deadline': boot_deadline, 'used': False, 'ready': ready,
             'start': lambda: os.write(pipe, b'S'), 'done': lambda: os.write(pipe, b'D'),
             'recognize': lambda raw: recognizer_module.recognize_bytes(raw, model)}
    server = HTTPServer(('0.0.0.0', 8080), handler_for(state))
    os.write(pipe, b'R')
    try:
        server.serve_forever()
    finally:
        os.close(pipe)
        server.server_close()
        os.waitpid(child, 0)


if __name__ == '__main__':
    main()
