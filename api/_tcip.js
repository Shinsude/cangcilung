var UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
var UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

function upstash(path, method) {
  var url = UPSTASH_URL + path;
  var opts = { method: method || 'GET' };
  if (UPSTASH_TOKEN) {
    opts.headers = { Authorization: 'Bearer ' + UPSTASH_TOKEN };
  }
  return fetch(url, opts).then(function (r) {
    return r.json().catch(function () { return {}; });
  });
}

function getJson(key) {
  if (!UPSTASH_URL) return Promise.resolve(null);
  return upstash('/get/' + encodeURIComponent(key)).then(function (d) {
    var v = d && d.result;
    if (v == null || v === '') return null;
    try { return JSON.parse(v); } catch (e) { return null; }
  });
}

function setJson(key, val) {
  if (!UPSTASH_URL) return Promise.resolve();
  return upstash('/set/' + encodeURIComponent(key) + '/' + encodeURIComponent(JSON.stringify(val))).then(function () {});
}

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

function fetchTcipDashboard() {
  return fetchJson('https://api.tcip.asia/public/dashboard', 8000);
}

function extractSignal(data) {
  var d = data && data.decision;
  if (!d || !d.symbol) return null;
  var price = d.current_price;
  if (price == null && data && data.market && data.market[0]) {
    price = data.market[0].bid;
  }
  return {
    symbol: String(d.symbol || '').toUpperCase(),
    timeframe: String(d.timeframe || 'M15').toUpperCase(),
    direction: String(d.direction || 'WAIT').toUpperCase(),
    confidence: d.confidence != null ? Math.round(Number(d.confidence)) : null,
    grade: String(d.grade || '').toUpperCase(),
    phase: String(d.phase || ''),
    risk_level: String(d.risk_level || ''),
    is_stale: !!d.is_stale,
    price: price != null ? Number(price) : null,
    updatedAt: Date.now()
  };
}

function sameSignal(a, b) {
  if (!a || !b) return false;
  return a.symbol === b.symbol &&
    a.timeframe === b.timeframe &&
    a.direction === b.direction &&
    a.confidence === b.confidence &&
    a.grade === b.grade &&
    a.phase === b.phase;
}

function mergeHistory(list, sig, cap) {
  list = list || [];
  cap = cap || 60;
  var merged = [sig].concat(list.filter(function (x) {
    return x && !sameSignal(x, sig);
  }));
  return merged.slice(0, cap);
}

function summarize(sig) {
  if (!sig) return null;
  return {
    symbol: sig.symbol,
    timeframe: sig.timeframe,
    direction: sig.direction,
    confidence: sig.confidence,
    grade: sig.grade,
    phase: sig.phase,
    risk_level: sig.risk_level,
    is_stale: sig.is_stale,
    price: sig.price,
    updatedAt: sig.updatedAt
  };
}

module.exports = {
  UPSTASH_URL: UPSTASH_URL,
  getJson: getJson,
  setJson: setJson,
  fetchTcipDashboard: fetchTcipDashboard,
  extractSignal: extractSignal,
  sameSignal: sameSignal,
  mergeHistory: mergeHistory,
  summarize: summarize
};
