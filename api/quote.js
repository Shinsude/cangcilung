'use strict';

var hits = {};
var globalHits = [];
var WINDOW = 60 * 1000;
var MAX_PER_IP = 60;
var MAX_GLOBAL = 600;

function clean() {
  var now = Date.now();
  for (var k in hits) { if (hits[k].until < now) delete hits[k]; }
  while (globalHits.length && globalHits[0] < now - WINDOW) globalHits.shift();
}

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    clean();
    var ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || 'anon';
    var now = Date.now();
    var rec = hits[ip] || { count: 0, until: now };
    if (rec.until <= now) { rec = { count: 0, until: now + WINDOW }; }
    rec.count++;
    hits[ip] = rec;
    globalHits.push(now);
    if (rec.count > MAX_PER_IP || globalHits.length > MAX_GLOBAL) {
      res.status(429).json({ success: false, error: 'rate limited' });
      return;
    }

    var url = req.query && req.query.url ? String(req.query.url) : '';
    if (!url) { res.status(400).json({ success: false, error: 'url required' }); return; }
    var allowHosts = {
      'query1.finance.yahoo.com': true,
      'query2.finance.yahoo.com': true,
      'stooq.com': true,
      'lite.duckduckgo.com': true,
      'gnews.io': true
    };
    var parsed;
    try { parsed = new URL(url); } catch (e) { res.status(400).json({ success: false, error: 'invalid url' }); return; }
    if (!allowHosts[parsed.host]) { res.status(403).json({ success: false, error: 'host not allowed' }); return; }

    var up = fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual' });
    var resp = await up;
    if (resp.status >= 300 && resp.status < 400) {
      res.status(502).json({ success: false, error: 'redirect not allowed' });
      return;
    }
    var buf = await resp.arrayBuffer();
    res.status(resp.status);
    res.setHeader('Content-Type', resp.headers.get('content-type') || 'text/plain');
    if (resp.ok) res.setHeader('Cache-Control', 'public, max-age=300');
    else res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(buf));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ success: false, error: (e && e.message) || 'fetch failed' });
  }
};
