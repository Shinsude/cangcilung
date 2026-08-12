import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'tcip-data');
const API_URL = process.env.TCIP_API_URL || 'https://api.tcip.asia/public/dashboard';

const HOUR = 60 * 60 * 1000;
const SAMPLE_TTL = 48 * HOUR;
const VERIFY_AFTER = 24 * HOUR + 30 * 60 * 1000;
const SAMPLE_TOLERANCE = 20 * 60 * 1000;
const WIN_THRESHOLD = 0.0005;

const HORIZONS = [
  { name: '1h', ms: 1 * HOUR },
  { name: '4h', ms: 4 * HOUR },
  { name: '24h', ms: 24 * HOUR }
];

const PRIMARY_HORIZON = {
  M1: '1h', M5: '1h', M15: '1h', M30: '1h',
  H1: '4h', H2: '4h',
  H4: '24h', D1: '24h', W1: '24h', MN: '24h'
};

function readJson(file) {
  try { return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')); } catch (e) { return null; }
}

function writeJson(file, val) {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(val, null, 2) + '\n');
}

function sameSignal(a, b) {
  if (!a || !b) return false;
  return a.symbol === b.symbol && a.timeframe === b.timeframe && a.direction === b.direction &&
    a.confidence === b.confidence && a.grade === b.grade && a.phase === b.phase;
}

function extractSignal(d) {
  if (!d || !d.symbol) return null;
  const price = d.current_price;
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

function extractPriceMap(data, sig) {
  const map = {};
  const market = data && data.market;
  if (Array.isArray(market)) {
    for (const m of market) {
      if (!m || typeof m !== 'object') continue;
      const sym = String(m.symbol || m.pair || m.name || '').toUpperCase();
      if (!sym) continue;
      let p = m.mid != null ? m.mid : (m.bid != null ? m.bid : (m.ask != null ? m.ask : null));
      if (p == null) p = m.price;
      if (p == null) p = m.current_price;
      if (p != null && Number(p) > 0) map[sym] = Number(p);
    }
  } else if (market && typeof market === 'object') {
    for (const sym of Object.keys(market)) {
      const v = market[sym];
      let p = v;
      if (v && typeof v === 'object') {
        p = v.mid != null ? v.mid : (v.bid != null ? v.bid : (v.price != null ? v.price : v.current_price));
      }
      if (p != null && Number(p) > 0) map[String(sym).toUpperCase()] = Number(p);
    }
  }
  if (sig && sig.price != null && !map[sig.symbol]) map[sig.symbol] = sig.price;
  return map;
}

function snapshotKey(sig) {
  return [sig.symbol, sig.timeframe, sig.direction, sig.updatedAt].join('|');
}

function nearestSample(samples, target, tolerance) {
  let best = null, bestDiff = Infinity;
  for (const s of samples) {
    const diff = Math.abs(s.t - target);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  if (!best) return null;
  return bestDiff <= tolerance ? { t: best.t, price: best.price } : null;
}

function classify(pnl) {
  if (pnl == null) return 'N/A';
  if (pnl > WIN_THRESHOLD) return 'WIN';
  if (pnl < -WIN_THRESHOLD) return 'LOSS';
  return 'DRAW';
}

function computePnl(direction, entry, exit) {
  if (entry == null || exit == null || entry === 0) return null;
  const raw = (exit - entry) / entry;
  return String(direction).toUpperCase() === 'SELL' ? -raw : raw;
}

function verifySnapshot(snap) {
  const samples = Object.keys(snap.samples || {})
    .map((t) => ({ t: Number(t), price: snap.samples[t] }))
    .sort((a, b) => a.t - b.t);
  const horizons = {};
  for (const h of HORIZONS) {
    const ns = nearestSample(samples, snap.entryAt + h.ms, SAMPLE_TOLERANCE);
    const pnl = ns ? computePnl(snap.direction, snap.entryPrice, ns.price) : null;
    horizons[h.name] = { t: ns ? ns.t : null, price: ns ? ns.price : null, pnl: pnl != null ? Number(pnl.toFixed(6)) : null };
  }
  const primary = snap.primaryHorizon || PRIMARY_HORIZON[snap.timeframe] || '4h';
  const h = horizons[primary];
  const result = h && h.pnl != null ? classify(h.pnl) : 'N/A';
  const values = HORIZONS.map((x) => horizons[x.name].pnl).filter((v) => v != null);
  const avgPnl = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return {
    key: snap.key, symbol: snap.symbol, timeframe: snap.timeframe, direction: snap.direction,
    entryPrice: snap.entryPrice, entryAt: snap.entryAt, primaryHorizon: primary,
    horizons, result, avgPnl: avgPnl != null ? Number(avgPnl.toFixed(6)) : null,
    sampleCount: samples.length,
    sampleSeries: samples.slice(-120).map((s) => ({ t: s.t, price: s.price })),
    verifiedAt: Date.now()
  };
}

function buildStats(verifications, history) {
  function bucket() {
    return { total: 0, wins: 0, losses: 0, draws: 0, noResult: 0, winRate: 0, avgPnl: null, pnlSum: 0 };
  }
  function add(b, v) {
    b.total++;
    if (v.result === 'WIN') b.wins++;
    else if (v.result === 'LOSS') b.losses++;
    else if (v.result === 'DRAW') b.draws++;
    else b.noResult++;
    if (v.avgPnl != null) b.pnlSum += v.avgPnl;
  }
  function finalize(b) {
    const scored = b.wins + b.losses + b.draws;
    b.winRate = scored ? Number((b.wins / scored).toFixed(3)) : 0;
    b.avgPnl = b.total ? Number((b.pnlSum / b.total).toFixed(5)) : null;
    delete b.pnlSum;
    return b;
  }

  const overall = bucket();
  const byDirection = {};
  const byTimeframe = {};
  const bySymbol = {};

  for (const key of Object.keys(verifications)) {
    const v = verifications[key];
    add(overall, v);
    const d = byDirection[v.direction] || (byDirection[v.direction] = bucket()); add(d, v);
    const tf = byTimeframe[v.timeframe] || (byTimeframe[v.timeframe] = bucket()); add(tf, v);
    const s = bySymbol[v.symbol] || (bySymbol[v.symbol] = bucket()); add(s, v);
  }

  for (const h of history) {
    if (h && h.symbol && bySymbol[h.symbol] && !bySymbol[h.symbol].lastSignal) {
      bySymbol[h.symbol].lastSignal = {
        timeframe: h.timeframe, direction: h.direction, confidence: h.confidence,
        grade: h.grade, phase: h.phase, price: h.price, updatedAt: h.updatedAt
      };
    }
  }

  for (const k of Object.keys(byDirection)) byDirection[k] = finalize(byDirection[k]);
  for (const k of Object.keys(byTimeframe)) byTimeframe[k] = finalize(byTimeframe[k]);
  for (const k of Object.keys(bySymbol)) bySymbol[k] = finalize(bySymbol[k]);

  const overallFinal = finalize(overall);

  return {
    generatedAt: Date.now(),
    total: overall.total, wins: overall.wins, losses: overall.losses, draws: overall.draws, noResult: overall.noResult,
    winRate: overallFinal.winRate, avgPnl: overallFinal.avgPnl,
    byDirection, byTimeframe, bySymbol
  };
}

const out = { ok: false, status: 'offline', at: Date.now(), error: null, changed: false };
let sig = null;
let priceMap = {};

try {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const res = await fetch(API_URL, { signal: ctrl.signal });
  clearTimeout(timer);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  sig = extractSignal(data && data.decision);
  priceMap = extractPriceMap(data, sig);
  const statusOk = { ok: true, status: 'online', at: Date.now(), error: null };
  writeJson('tcip-status.json', statusOk);
  out.ok = true; out.status = 'online';

  if (sig) {
    const prev = readJson('tcip-latest.json');
    const history = readJson('tcip-history.json') || [];
    const changed = !sameSignal(prev, sig);
    const newHistory = [sig].concat(history.filter((h) => !sameSignal(h, sig))).slice(0, 60);
    writeJson('tcip-latest.json', sig);
    writeJson('tcip-history.json', newHistory);
    out.changed = changed;
    out.signal = sig.symbol + ' ' + sig.timeframe + ' ' + sig.direction;
  } else {
    out.signal = null;
  }
} catch (e) {
  out.error = String((e && e.message) || e).slice(0, 200);
  const prev = readJson('tcip-status.json');
  const lastFlip = prev && (Date.now() - (prev.at || 0));
  if (!prev || prev.status !== 'offline' || lastFlip > 15 * 60 * 1000) {
    writeJson('tcip-status.json', out);
  }
}

/* ===== Sampling harga & verifikasi akurasi ===== */
const now = Date.now();
const snapshots = readJson('tcip-snapshots.json') || {};
const verifications = readJson('tcip-verifications.json') || {};

if (sig && out.changed && sig.price != null) {
  const key = snapshotKey(sig);
  if (!snapshots[key]) {
    snapshots[key] = {
      key: key,
      symbol: sig.symbol, timeframe: sig.timeframe, direction: sig.direction,
      entryPrice: sig.price, entryAt: sig.updatedAt,
      primaryHorizon: PRIMARY_HORIZON[sig.timeframe] || '4h',
      samples: {}
    };
    snapshots[key].samples[String(sig.updatedAt)] = sig.price;
  }
}

for (const key of Object.keys(snapshots)) {
  const snap = snapshots[key];
  if (now - snap.entryAt > SAMPLE_TTL) continue;
  const p = priceMap[snap.symbol];
  if (p != null) snap.samples[String(now)] = p;
}

const dueKeys = [];
for (const key of Object.keys(snapshots)) {
  const snap = snapshots[key];
  if (now - snap.entryAt >= VERIFY_AFTER) dueKeys.push(key);
}
for (const key of dueKeys) {
  verifications[key] = verifySnapshot(snapshots[key]);
  delete snapshots[key];
}

for (const key of Object.keys(snapshots)) {
  const snap = snapshots[key];
  if (now - snap.entryAt > SAMPLE_TTL + 24 * HOUR) {
    verifications[key] = verifySnapshot(snapshots[key]);
    delete snapshots[key];
  }
}

writeJson('tcip-snapshots.json', snapshots);
writeJson('tcip-verifications.json', verifications);

const historyFinal = readJson('tcip-history.json') || [];
const stats = buildStats(verifications, historyFinal);
writeJson('tcip-stats.json', stats);

out.verifiedCount = Object.keys(verifications).length;
out.trackingCount = Object.keys(snapshots).length;
out.wins = stats.wins; out.losses = stats.losses; out.draws = stats.draws; out.winRate = stats.winRate;

process.stdout.write(JSON.stringify(out) + '\n');
