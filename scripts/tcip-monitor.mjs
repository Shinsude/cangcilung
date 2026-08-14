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
  if (!d || !d.symbol) return null;  const price = d.current_price;
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

function normalizeMarket(market) {
  if (!market) return null;
  if (Array.isArray(market)) {
    const out = {};
    for (const m of market) {
      if (!m || typeof m !== 'object') continue;
      const sym = String(m.symbol || m.pair || m.name || '').toUpperCase();
      if (!sym) continue;
      out[sym] = m;
    }
    return Object.keys(out).length ? out : null;
  }
  if (typeof market === 'object') return market;
  return null;
}

function extractPriceMap(data, sig) {
  const map = {};
  const market = data && (data.market_prices || data.market);
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
        p = v.mid != null ? v.mid : (v.bid != null ? v.bid : (v.ask != null ? v.ask : (v.price != null ? v.price : v.current_price)));
      }
      if (p != null && Number(p) > 0) map[String(sym).toUpperCase()] = Number(p);
    }
  }
  if (sig && sig.price != null && !map[sig.symbol]) map[sig.symbol] = sig.price;
  return map;
}

function extractDetail(data, sig) {
  const insight = data && (data.insight_data || data.decision);
  const market = data && (data.market_prices || data.market);
  const pick = (o, k, fb) => (o && o[k] != null ? o[k] : fb);
  const d = {
    generatedAt: Date.now(),
    symbol: pick(insight, 'symbol', sig && sig.symbol),
    timeframe: pick(insight, 'timeframe', sig && sig.timeframe),
    direction: pick(insight, 'direction', sig && sig.direction),
    confidence: pick(insight, 'confidence', sig && sig.confidence),
    grade: pick(insight, 'grade', sig && sig.grade),
    phase: pick(insight, 'phase', sig && sig.phase),
    risk_level: pick(insight, 'risk_level', sig && sig.risk_level),
    verdict: pick(insight, 'verdict', ''),
    final_reco: pick(insight, 'final_reco', ''),
    regime: pick(insight, 'regime', ''),
    decomp_regime: pick(insight, 'decomp_regime', ''),
    volatility_regime: pick(insight, 'volatility_regime', ''),
    stability: pick(insight, 'stability', ''),
    is_stale: pick(insight, 'is_stale', false),
    ts_intrinsic: pick(insight, 'ts_intrinsic', null),
    ts_snr: pick(insight, 'ts_snr', null),
    weighted_alignment: pick(insight, 'weighted_alignment', null),
    trend_consistency_pct: pick(insight, 'trend_consistency_pct', null),
    composite_score: pick(insight, 'composite_score', null),
    confluence_score: pick(insight, 'confluence_score', null),
    tech_score: pick(insight, 'tech_score', null),
    coherence_score: pick(insight, 'coherence_score', null),
    institutional_flow_score: pick(insight, 'institutional_flow_score', null),
    ml_confidence: pick(insight, 'ml_confidence', null),
    layers: {
      tcip: pick(insight, 'tcip_component', null),
      key: pick(insight, 'key_level_score', null),
      candle: pick(insight, 'candle_score', null),
      session: pick(insight, 'session_score', null),
      atr: pick(insight, 'atr_score', null),
      ml: pick(insight, 'ml_component', null)
    },
    mtf: {
      d1_dir: pick(insight, 'mtf_d1_dir', ''),
      h4_dir: pick(insight, 'mtf_h4_dir', ''),
      h1_dir: pick(insight, 'mtf_h1_dir', ''),
      m30_dir: pick(insight, 'mtf_m30_dir', ''),
      m15_dir: pick(insight, 'mtf_m15_dir', ''),
      d1_score: pick(insight, 'mtf_d1_score', null),
      h4_score: pick(insight, 'mtf_h4_score', null),
      h1_score: pick(insight, 'mtf_h1_score', null),
      m30_score: pick(insight, 'mtf_m30_score', null),
      m15_score: pick(insight, 'mtf_m15_score', null),
      w1_d1_aligned: pick(insight, 'w1_d1_aligned', null),
      d1_h4_aligned: pick(insight, 'd1_h4_aligned', null),
      h4_h1_aligned: pick(insight, 'h4_h1_aligned', null),
      h1_m30_aligned: pick(insight, 'h1_m30_aligned', null),
      m30_m15_aligned: pick(insight, 'm30_m15_aligned', null)
    },
    indicators: {
      rsi_14: pick(insight, 'rsi_14', null),
      macd_line: pick(insight, 'macd_line', null),
      macd_signal: pick(insight, 'macd_signal', null),
      macd_hist: pick(insight, 'macd_hist', null),
      bb_pct_b: pick(insight, 'bb_pct_b', null),
      cvd: pick(insight, 'cvd', null),
      current_cvd: pick(insight, 'current_cvd', null),
      cvd_efficiency: pick(insight, 'cvd_efficiency', null),
      net_flow: pick(insight, 'net_flow', null),
      flow_direction: pick(insight, 'flow_direction', '')
    },
    levels: {
      entry_price: pick(insight, 'entry_price', null),
      support_price: pick(insight, 'support_price', null),
      resistance_price: pick(insight, 'resistance_price', null),
      nearest_support: pick(insight, 'nearest_support', null),
      nearest_resistance: pick(insight, 'nearest_resistance', null)
    },
    risk: {
      atr: pick(insight, 'atr', null),
      atr_points: pick(insight, 'atr_points', null),
      spread_points: pick(insight, 'spread_points', null),
      sl_pips: pick(insight, 'suggested_sl_pips', null),
      tp_pips: pick(insight, 'suggested_tp_pips', null),
      risk_reward: pick(insight, 'risk_reward', null)
    },
    entry_strength: pick(insight, 'entry_strength', ''),
    signal_consistency: pick(insight, 'signal_consistency', null),
    adaptive_lookback: pick(insight, 'adaptive_lookback', null),
    filter_reason: pick(insight, 'filter_reason', ''),
    hierarchy_reason: pick(insight, 'hierarchy_reason', ''),
    smc: { warning: pick(insight, 'smc_warning', null), confluence: pick(insight, 'smc_confluence', null) },
    roll_under_reco: pick(insight, 'roll_under_reco', ''),
    inferred_reversal: pick(insight, 'inferred_reversal', ''),
    reversal_confidence: pick(insight, 'reversal_confidence', null),
    safety: {
      status: pick(insight, 'safety_status', ''),
      violated: pick(insight, 'safety_bounds_violated', null),
      total: pick(insight, 'safety_bounds_total', null)
    },
    primary_context: pick(insight, 'primary_context', ''),
    primary_bias: pick(insight, 'primary_bias', ''),
    signal_age_s: pick(insight, 'signal_age_s', null),
    market_quality: pick(insight, 'market_quality', ''),
    session_name: pick(insight, 'session_name', ''),
    divergence_status: pick(insight, 'divergence_status', ''),
    divergence_downgraded: pick(insight, 'divergence_downgraded', null),
    market_prices: normalizeMarket(market),
    pnl_summary: data && data.pnl_summary || null,
    ml_status: data && data.ml_status || null,
    pipeline_health: data && data.pipeline_health || null,
    system_analysis: data && data.system_analysis || null,
    eco_cal: data && data.eco_cal || null,
    cr_engine_stats: data && data.cr_engine_stats || null,
    open_positions: data && data.open_positions != null ? data.open_positions : null,
    open_details: Array.isArray(data && data.open_details) ? data.open_details : null,
    recent_signals: Array.isArray(data && data.recent_signals) ? data.recent_signals : null
  };
  return d;
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
    grade: snap.grade || null, confidence: snap.confidence != null ? snap.confidence : null, phase: snap.phase || null,
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

function buildLearnings(verifications, stats) {
  const entries = Object.keys(verifications).map((k) => verifications[k]);
  const scored = entries.filter((v) => v.result === 'WIN' || v.result === 'LOSS' || v.result === 'DRAW');
  const scoredTotal = scored.length;

  function agg(field) {
    const map = {};
    for (const v of scored) {
      const key = String(v[field] == null || v[field] === '' ? '(kosong)' : v[field]).toUpperCase();
      const b = map[key] || (map[key] = { total: 0, wins: 0, losses: 0, draws: 0, pnlSum: 0, pnlN: 0 });
      b.total++;
      if (v.result === 'WIN') b.wins++;
      else if (v.result === 'LOSS') b.losses++;
      else if (v.result === 'DRAW') b.draws++;
      if (v.avgPnl != null) { b.pnlSum += v.avgPnl; b.pnlN++; }
    }
    const rows = Object.keys(map).map((key) => {
      const b = map[key];
      const scoredHere = b.wins + b.losses + b.draws;
      b.winRate = scoredHere ? Number((b.wins / scoredHere).toFixed(3)) : 0;
      b.avgPnl = b.pnlN ? Number((b.pnlSum / b.pnlN).toFixed(5)) : null;
      delete b.pnlSum; delete b.pnlN;
      b.name = key;
      return b;
    });
    rows.sort((a, b2) => (b2.winRate - a.winRate) || (b2.total - a.total));
    return rows;
  }

  function bestOf(rows, minSamples) {
    const eligible = rows.filter((r) => r.total >= minSamples && (r.wins + r.losses + r.draws) > 0);
    return eligible.length ? eligible[0] : null;
  }

  const byDirection = agg('direction');
  const byGrade = agg('grade');
  const byTimeframe = agg('timeframe');
  const bySymbol = agg('symbol');

  const best = {
    direction: bestOf(byDirection, 3),
    grade: bestOf(byGrade, 2),
    timeframe: bestOf(byTimeframe, 2),
    symbol: bestOf(bySymbol, 2)
  };

  const insights = [];
  if (scoredTotal > 0) {
    insights.push('Dari ' + scoredTotal + ' sinyal terverifikasi, win rate keseluruhan ' + Math.round((stats.winRate || 0) * 100) + '%.');
    if (best.direction) insights.push('Arah paling akurat: ' + best.direction.name + ' (win rate ' + Math.round(best.direction.winRate * 100) + '% dari ' + best.direction.total + ' sinyal).');
    if (best.grade) insights.push('Grade paling akurat: ' + best.grade.name + ' (win rate ' + Math.round(best.grade.winRate * 100) + '% dari ' + best.grade.total + ' sinyal).');
    if (best.timeframe) insights.push('Timeframe paling akurat: ' + best.timeframe.name + ' (win rate ' + Math.round(best.timeframe.winRate * 100) + '% dari ' + best.timeframe.total + ' sinyal).');
    if (best.symbol) insights.push('Simbol paling akurat: ' + best.symbol.name + ' (win rate ' + Math.round(best.symbol.winRate * 100) + '% dari ' + best.symbol.total + ' sinyal).');
    const worst = bySymbol.length && bySymbol[bySymbol.length - 1];
    if (worst && worst.total >= 3) insights.push('Perhatian: ' + worst.name + ' menunjukkan win rate ' + Math.round(worst.winRate * 100) + '% (' + worst.total + ' sinyal) — patut dipantau.');

    const highConf = scored.filter((v) => v.confidence != null && v.confidence >= 70);
    if (highConf.length >= 3) {
      const hcWins = highConf.filter((v) => v.result === 'WIN').length;
      insights.push('Sinyal dengan confidence >= 70%: ' + highConf.length + ' sinyal, win rate ' + Math.round((hcWins / highConf.length) * 100) + '%.');
    }
  } else {
    insights.push('Belum ada sinyal terverifikasi. Data pembelajaran mulai terkumpul seiring pemantauan berjalan.');
  }

  return {
    generatedAt: Date.now(),
    verifiedTotal: scoredTotal,
    trackedTotal: entries.length,
    best,
    rankings: { byDirection, byGrade, byTimeframe, bySymbol },
    insights
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
  const insight = data && (data.insight_data || data.decision);
  sig = extractSignal(insight);
  priceMap = extractPriceMap(data, sig);
  const statusOk = { ok: true, status: 'online', at: Date.now(), error: null };
  writeJson('tcip-status.json', statusOk);
  out.ok = true; out.status = 'online';
  writeJson('tcip-detail.json', extractDetail(data, sig));

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
      grade: sig.grade || null, confidence: sig.confidence != null ? sig.confidence : null, phase: sig.phase || null,
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

const learnings = buildLearnings(verifications, stats);
writeJson('tcip-learnings.json', learnings);

out.verifiedCount = Object.keys(verifications).length;
out.trackingCount = Object.keys(snapshots).length;
out.wins = stats.wins; out.losses = stats.losses; out.draws = stats.draws; out.winRate = stats.winRate;

process.stdout.write(JSON.stringify(out) + '\n');
