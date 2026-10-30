// Static server for the probe shell plus the verified sample, with byte ranges
// so seek behaves as it would from a real host. Node built-ins only.
import {createServer} from 'node:http';
import {readFileSync, statSync, createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {extname} from 'node:path';
import {resolveSample} from './sample.mjs';

const SHELL = fileURLToPath(new URL('./shell/', import.meta.url));
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json'};

export function startServer({port = 0, host = '127.0.0.1'} = {}) {
  const sample = resolveSample();
  const sampleJson = JSON.stringify({id: sample.id, url: './sample.mp3', sha256: sample.sha256, bytes: sample.bytes, duration: sample.duration});
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/sample.json') return res.writeHead(200, {'content-type': TYPES['.json'], 'cache-control': 'no-store'}).end(sampleJson);
    if (path === '/sample.mp3') {
      const size = statSync(sample.file).size;
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (!m) return createReadStream(sample.file).pipe(res.writeHead(200, {'content-type': sample.mime, 'content-length': size, 'accept-ranges': 'bytes'}));
      // Over-long ends and suffixes are capped at the file, per RFC 9110 14.1.2.
      const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
      const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (!(start >= 0 && start <= end && end < size)) return res.writeHead(416, {'content-range': `bytes */${size}`}).end();
      return createReadStream(sample.file, {start, end}).pipe(res.writeHead(206, {'content-type': sample.mime, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes'}));
    }
    const name = path === '/' ? 'index.html' : path.slice(1);
    if (!/^[a-z]+\.(html|js)$/.test(name)) return res.writeHead(404).end();
    try { res.writeHead(200, {'content-type': TYPES[extname(name)], 'cache-control': 'no-store'}).end(readFileSync(SHELL + name)); }
    catch { res.writeHead(404).end(); }
  });
  return new Promise(resolve => server.listen(port, host, () => resolve({server, url: `http://${host}:${server.address().port}`, sample})));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {url} = await startServer({port: Number(process.env.PORT || 4180), host: process.env.HOST || '127.0.0.1'});
  console.log(`platform probe shell at ${url}`);
}
