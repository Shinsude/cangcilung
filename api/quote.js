module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    var url = req.query && req.query.url ? String(req.query.url) : '';
    if (!url) { res.status(400).json({ success: false, error: 'url required' }); return; }
    var allowHosts = {
      'query1.finance.yahoo.com': true,
      'query2.finance.yahoo.com': true,
      'stooq.com': true
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
    res.send(Buffer.from(buf));
  } catch (e) {
    res.status(502).json({ success: false, error: (e && e.message) || 'fetch failed' });
  }
};
