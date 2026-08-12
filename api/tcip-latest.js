var RAW_BASE = 'https://raw.githubusercontent.com/Shinsude/cangcilung/main/tcip-data/';

function fetchJson(url, timeoutMs) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs || 8000);
  return fetch(url, { signal: ctrl.signal }).then(function (r) {
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).catch(function (err) {
    clearTimeout(t);
    throw err;
  });
}

module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  var latest = null;
  var history = [];
  var lastcheck = null;

  try { latest = await fetchJson(RAW_BASE + 'tcip-latest.json', 6000); } catch (e) {}
  try {
    history = await fetchJson(RAW_BASE + 'tcip-history.json', 6000);
    if (!Array.isArray(history)) history = [];
  } catch (e) { history = []; }
  try { lastcheck = await fetchJson(RAW_BASE + 'tcip-status.json', 6000); } catch (e) {}

  var stale = latest && latest.updatedAt && (Date.now() - latest.updatedAt > 45 * 60 * 1000);
  if (!latest || stale) {
    try {
      var data = await fetchJson('https://api.tcip.asia/public/dashboard', 8000);
      var d = data && data.decision;
      if (d && d.symbol) {
        latest = {
          symbol: String(d.symbol || '').toUpperCase(),
          timeframe: String(d.timeframe || 'M15').toUpperCase(),
          direction: String(d.direction || 'WAIT').toUpperCase(),
          confidence: d.confidence != null ? Math.round(Number(d.confidence)) : null,
          grade: String(d.grade || '').toUpperCase(),
          phase: String(d.phase || ''),
          risk_level: String(d.risk_level || ''),
          is_stale: !!d.is_stale,
          price: d.current_price != null ? Number(d.current_price) : null,
          updatedAt: Date.now(),
          live: true
        };
        lastcheck = { ok: true, status: 'online', at: Date.now() };
      }
    } catch (e) {}
  }

  res.status(200).json({ latest: latest, history: history, lastcheck: lastcheck });
};
