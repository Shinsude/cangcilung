'use strict';

/* Proxy chat server-side (opsional, aman).
   Tujuan: biarkan API key (mis. Groq) disimpan sebagai Environment Variable
   di Vercel, BUKAN di browser, sehingga tidak pernah bocor ke pengguna.

   Pemakaian (opsional, tidak mengubah mode default):
   - Di pengaturan cangcilung, arahkan Base URL relatif ke '/api' (publik di Vercel ini),
     TANPA mengisi API key di browser.
   - Atau panggil langsung: POST /api/chat dengan body:
       { method:'chat', model, messages, temperature, top_p, max_tokens, stream }
   - Server menambah Authorization dari process.env.GROQ_API_KEY (atau PROXY_API_KEY).

   Catatan CORS: aplikasi yang sama-origin (Vercel) tidak perlu key tambahan.
   Bila dipakai dari origin lain, tambahkan process.env.ALLOWED_ORIGIN untuk putih daftar.
*/

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  var apiKey = process.env.GROQ_API_KEY || process.env.PROXY_API_KEY || '';
  if (!apiKey) {
    res.status(503).json({ error: { message: 'Proxy belum dikonfigurasi (GROQ_API_KEY belum di-set di Vercel).' } });
    return;
  }
  var baseUrl = process.env.PROXY_BASE_URL || 'https://api.groq.com/openai/v1';
  var apiBase = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1';

  var body;
  try { body = JSON.parse(req.body && req.body.length ? req.body : '{}'); }
  catch (e) { res.status(400).json({ error: { message: 'body tidak valid' } }); return; }

  var payload = {
    model: body.model || process.env.PROXY_MODEL || 'openai/gpt-oss-120b',
    stream: body.stream !== false,
    messages: Array.isArray(body.messages) ? body.messages : []
  };
  if (body.temperature) payload.temperature = body.temperature;
  if (body.top_p) payload.top_p = body.top_p;
  if (body.max_tokens) payload.max_tokens = body.max_tokens;
  if (!payload.messages.length) {
    res.status(400).json({ error: { message: 'messages kosong' } });
    return;
  }

  var upstream;
  try {
    upstream = await fetch(apiBase + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    res.status(502).json({ error: { message: (e && e.message) || 'upstream gagal' } });
    return;
  }

  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream');
  if (upstream.status >= 400) {
    var errText = await upstream.text();
    res.json({ error: { message: errText.slice(0, 400) } });
    return;
  }

  if (!payload.stream || !upstream.body) {
    var buf = await upstream.arrayBuffer();
    res.send(Buffer.from(buf));
    return;
  }

  /* Streaming pass-through. */
  const reader = upstream.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(encoder.encode(decoder.decode(value, { stream: true })));
    }
  } finally {
    try { reader.releaseLock(); } catch (e) {}
    try { res.end(); } catch (e) {}
  }
};
