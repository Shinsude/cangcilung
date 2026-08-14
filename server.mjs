import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const HOST = process.env.HOST || '0.0.0.0';
const LLAMA = process.env.LLAMA || 'http://127.0.0.1:11434';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);

  // Reverse proxy ke backend lokal (llama.cpp / Ollama / dll.)
  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/api/')) {
    const target = new URL(LLAMA + url.pathname + url.search);
    const up = await fetch(target, {
      method: req.method,
      headers: {
        'content-type': req.headers['content-type'] || '',
        'accept': req.headers['accept'] || '',
        'authorization': req.headers['authorization'] || '',
      },
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : req,
      duplex: 'half',
      redirect: 'manual',
    });
    res.writeHead(up.status, {
      'content-type': up.headers.get('content-type') || 'application/json',
      'access-control-allow-origin': '*',
    });
    for await (const chunk of up.body) res.write(chunk);
    res.end();
    return;
  }

  // File statis
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const abs = path.join(__dirname, file);
  if (!abs.startsWith(__dirname)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' });
  fs.createReadStream(abs).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`cangcilung proxy berjalan di http://${HOST}:${PORT} (backend AI: ${LLAMA})`);
});
