// Mock Stable Diffusion (A1111) untuk menguji auto-detect cangcilung.
// Jalankan:  node mock_sd.mjs
// Lalu buka index.html dan ketik "gambar: <deskripsi>".
// Tiru A1111 asli: endpoint /sd-models, /txt2img (batch), /progress (step progress),
// dan tulis prompt ke gambar dengan font bitmap.
import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const HOST = '127.0.0.1';
const PORT = 7860;
const JOB_MS = 2500; // simulasi lama pembuatan
const SD_STEPS = 30;

let activeJob = null; // { start, duration }

// --- Font bitmap 5x7 ---
const FONT = {
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10001','10000','10111','10001','10001','01111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['11111','00100','00100','00100','00100','00100','11111'],
  'J': ['00111','00010','00010','00010','00010','10010','01100'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','10001','11001','10101','10011','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','10101','01010'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  '-': ['00000','00000','00000','01110','00000','00000','00000'],
  ':': ['01100','01100','00000','00000','00000','01100','01100'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '/': ['00001','00010','00100','01000','10000','00000','00000']
};

function makeTextPng(w, h, r, g, b, text) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const px = new Uint8Array(w * h * 3);
  // latar gradien
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const rr = Math.round(14 + t * 22), gg = Math.round(16 + t * 28), bb = Math.round(34 + t * 48);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      px[o] = rr; px[o + 1] = gg; px[o + 2] = bb;
    }
  }

  const SCALE = 5, GW = 6, GH = 8; // 5x7 glyph + 1 spasi antar glyph/baris
  const upper = String(text).toUpperCase().replace(/[^A-Z0-9 .\-:\/!]/g, '');
  const lines = [];
  let cur = '';
  for (const ch of upper) {
    if ((cur.length + 1) * GW > w / SCALE) { lines.push(cur); cur = ch; }
    else cur += ch;
  }
  if (cur) lines.push(cur);
  const maxLines = Math.max(1, Math.floor((h / SCALE) / GH) - 1);
  while (lines.length > maxLines) lines.pop();
  const totalH = lines.length * GH * SCALE;
  let startY = Math.max(0, Math.floor((h - totalH) / 2));

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineW = line.length * GW * SCALE;
    let startX = Math.max(0, Math.floor((w - lineW) / 2));
    for (let ci = 0; ci < line.length; ci++) {
      const glyph = FONT[line[ci]] || FONT[' '];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (glyph[row][col] !== '1') continue;
          const x0 = startX + ci * GW * SCALE + col * SCALE;
          const y0 = startY + li * GH * SCALE + row * SCALE;
          for (let dy = 0; dy < SCALE; dy++) {
            for (let dx = 0; dx < SCALE; dx++) {
              const X = x0 + dx, Y = y0 + dy;
              if (X < 0 || X >= w || Y < 0 || Y >= h) continue;
              const o = (Y * w + X) * 3;
              px[o] = r; px[o + 1] = g; px[o + 2] = b;
            }
          }
        }
      }
    }
  }

  // scanlines RGB
  const raw = Buffer.alloc((1 + w * 3) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      const d = y * (1 + w * 3) + 1 + x * 3;
      raw[d] = px[o]; raw[d + 1] = px[o + 1]; raw[d + 2] = px[o + 2];
    }
  }

  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); crcTable[n] = c; }
  const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const tb = Buffer.from(type, 'ascii');
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
    return Buffer.concat([len, tb, data, cb]);
  };
  const txt = Buffer.concat([Buffer.from('Comment\0', 'binary'), Buffer.from(String(text).slice(0, 200), 'utf8')]);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('tEXt', txt), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function sendJson(res, obj, status = 200) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': body.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Private-Network': 'true'
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Private-Network': 'true'
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/sdapi/v1/sd-models') {
    console.log('[GET] sd-models');
    return sendJson(res, [
      { title: 'pony-diffusion-v6.safetensors [pony]', model_name: 'pony-diffusion-v6.safetensors' },
      { title: 'realisticVision-v51.safetensors [real]', model_name: 'realisticVision-v51.safetensors' },
      { title: 'mock-model-v1.ckpt [mock]', model_name: 'mock-model-v1' }
    ]);
  }

  if (req.method === 'GET' && url.pathname === '/sdapi/v1/progress') {
    const state = { skipped: false, interrupted: false, job: 'mock', job_count: 1, job_timestamp: String(Date.now()), sampling_step: 0, sampling_steps: 0 };
    if (activeJob) {
      const elapsed = Date.now() - activeJob.start;
      const p = Math.min(0.99, elapsed / activeJob.duration);
      state.progress = p;
      state.eta_relative = activeJob.duration * (1 - p) / 1000;
      state.sampling_step = Math.floor(p * SD_STEPS);
      state.sampling_steps = SD_STEPS;
    } else {
      state.progress = 0;
      state.eta_relative = -1;
    }
    return sendJson(res, state);
  }

  if (req.method === 'POST' && url.pathname === '/sdapi/v1/options') {
    let raw = '';
    req.on('data', d => { raw += d; });
    req.on('end', () => {
      try { console.log('[POST] options -> checkpoint: ' + JSON.parse(raw).sd_model_checkpoint); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end('{"ok":true}');
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/sdapi/v1/txt2img') {
    let raw = '';
    req.on('data', d => { raw += d; });
    req.on('end', () => {
      let prompt = 'gambar';
      let batch = 1;
      let seed = -1;
      let negative = '';
      try {
        const d = JSON.parse(raw);
        prompt = (d.prompt || 'gambar').toString();
        batch = Math.max(1, parseInt(d.batch_size, 10) || 1);
        seed = parseInt(d.seed, 10) || -1;
        negative = (d.negative_prompt || '').toString();
      } catch {}
      try { fs.appendFileSync(path.join(import.meta.dirname, 'mock_requests.log'), JSON.stringify({ ts: Date.now(), prompt, negative, seed, batch }) + '\n'); } catch {}
      const n = Math.min(batch, 4);
      activeJob = { start: Date.now(), duration: JOB_MS };
      const images = [];
      for (let i = 0; i < n; i++) {
        const h = (seed >= 0 ? seed : Math.floor(Math.random() * 0xffffffff)) + i * 0x1013;
        const r = 180 + (h % 60), g = 130 + ((h >> 5) % 80), b = 90 + ((h >> 9) % 70);
        images.push(makeTextPng(832, 832, r, g, b, prompt));
      }
      console.log('[POST] txt2img -> prompt="' + prompt + '" batch=' + n);
      setTimeout(() => {
        activeJob = null;
        return sendJson(res, { images: images.map(b => b.toString('base64')), info: JSON.stringify({ prompt, seed }) });
      }, JOB_MS);
    });
    return;
  }

  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
  res.end('not found');
});

server.listen(PORT, HOST, () => {
  console.log('============================================');
  console.log(`  MOCK A1111 aktif di http://${HOST}:${PORT}`);
  console.log('  Auto-detect cangcilung akan menemukannya.');
  console.log('  Tekan Ctrl+C untuk berhenti.');
  console.log('============================================');
});
