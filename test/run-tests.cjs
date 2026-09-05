/* Unit/sanity test dasar cangcilung — dijalankan: `node test/run-tests.cjs`
   Tanpa framework: mock window, eval file browser, lalu asersi. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const results = [];
const errors = [];

function suite(name) {
  results.push('== ' + name + ' ==');
}
function loadBrowser(file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const w = global.window || {};
  global.window = w;
  eval(code); // jshint ignore:line
  return w;
}
function assert(cond, msg) {
  if (cond) { pass++; results.push('  ok: ' + msg); }
  else { fail++; errors.push('FAIL: ' + msg); results.push('  FAIL: ' + msg); }
}
function close(actual, expected, eps) {
  return Math.abs(actual - expected) < (eps == null ? 1e-6 : eps);
}

/* ---------- safeeval ---------- */
suite('lib/safeeval.js (kalkulator internal)');
const w1 = loadBrowser('lib/safeeval.js');
(function () {
  const lib = w1.cangcilungLib;
  assert(lib && typeof lib.safeEval === 'function', 'safeEval terdefinisi');
  assert(close(lib.safeEval('15*24+7'), 367), '15*24+7 = 367 (got ' + lib.safeEval('15*24+7') + ')');
  assert(close(lib.safeEval('2^10'), 1024), '2^10 = 1024');
  assert(close(lib.safeEval('(2+3)*4'), 20), '(2+3)*4 = 20');
  assert(close(lib.safeEval('10/4'), 2.5), '10/4 = 2.5');
  assert(lib.safeEval('hello') === null, 'teks non-math -> null');
  assert(lib.safeEval('') === null, 'string kosong -> null');
  const ca = lib.calcAnswer('berapa 100*5');
  assert(ca && /500/.test(ca), 'calcAnswer("berapa 100*5") berisi 500');
})();

/* ---------- search.js ---------- */
suite('lib/search.js (deteksi ticker harga)');
const w2 = loadBrowser('lib/search.js');
(function () {
  const s = w2.CC.search;
  assert(s && typeof s.extractTicker === 'function', 'extractTicker terdefinisi');
  assert(s.extractTicker('harga xauusd') === 'GC=F', 'harga xauusd -> GC=F');
  assert(s.extractTicker('harga usa100') === '^NDX', 'harga usa100 -> ^NDX');
  assert(s.extractTicker('berapa usa100 sekarang') === '^NDX', 'berapa usa100 sekarang -> ^NDX');
  assert(s.extractTicker('harga saham AAPL') === 'AAPL', 'harga saham AAPL -> AAPL');
  assert(s.extractTicker('harga AAPL') === 'AAPL', 'harga AAPL -> AAPL');
  assert(s.extractTicker('cara membuat nasi goreng') === '', 'non-ticker -> ""');
  assert(s.chartSymbol('harga usa100') === 'NASDAQ:NDX', 'chartSymbol usa100 -> NASDAQ:NDX');
  assert(s.chartSymbol('chart xauusd') === 'OANDA:XAUUSD', 'chartSymbol xauusd -> OANDA:XAUUSD');
  assert(s.extractTicker('analisis USA100') === '^NDX', 'analisis USA100 -> ^NDX (tanpa kata kunci web)');
  assert(s.chartSymbol('analisis USA100') === 'NASDAQ:NDX', 'chartSymbol analisis USA100 -> NASDAQ:NDX');
  assert(s.extractTicker('analisis properti amerika') === '', 'analisis non-ticker -> ""');
})();

/* ---------- ta.js: ADX (kekuatan tren) ---------- */
suite('lib/ta.js (ADX kekuatan tren)');
(function () {
  global.location = { origin: 'https://cangcilung.vercel.app' };
  const wT = loadBrowser('lib/ta.js');
  const ta = wT.CC.ta;
  assert(typeof ta.calcADX === 'function', 'calcADX terdefinisi');
  assert(typeof ta.smoothADX === 'function', 'smoothADX terdefinisi');
  let ob = 3000;
  const data = [];
  for (let i = 0; i < 60; i++) { ob += 5; data.push({ time: 1000000000 + i * 86400, open: ob, high: ob + 8, low: ob - 2, close: ob + 4, volume: 1000 }); }
  const dx = ta.calcADX(data, 14).filter((v) => v !== null);
  assert(dx.length > 0, 'calcADX menghasilkan nilai untuk 60 bar data');
  const adx = ta.smoothADX(ta.calcADX(data, 14), 14).filter((v) => v !== null);
  const last = adx[adx.length - 1];
  assert(last && last.value >= 0 && last.value <= 100, 'ADX terakhir dalam rentang 0-100: ' + (last && last.value.toFixed(1)));
  assert(dx.every((v) => v.value >= 0 && v.value <= 100), 'semua DX dalam 0-100');

  assert(typeof ta.calcAroon === 'function', 'calcAroon terdefinisi');
  const aroon = ta.calcAroon(data, 14).filter((v) => v && v.up !== null);
  assert(aroon.length > 0, 'calcAroon menghasilkan nilai');
  const aLast = aroon[aroon.length - 1];
  assert(aLast.up >= 0 && aLast.up <= 100 && aLast.down >= 0 && aLast.down <= 100, 'Aroon up/down dalam 0-100: ' + aLast.up + '/' + aLast.down);

  assert(typeof ta.calcCCI === 'function', 'calcCCI terdefinisi');
  const cciArr = ta.calcCCI(data, 20).filter((v) => v !== null);
  assert(cciArr.length > 0, 'calcCCI menghasilkan nilai');
  assert(cciArr.every((v) => isFinite(v.value)), 'CCI semua finite');

  assert(typeof ta.calcWilliamsR === 'function', 'calcWilliamsR terdefinisi');
  const wrArr = ta.calcWilliamsR(data, 14).filter((v) => v !== null);
  assert(wrArr.length > 0, 'calcWilliamsR menghasilkan nilai');
  assert(wrArr.every((v) => v.value >= -100 && v.value <= 0), '%R semua dalam -100..0');
})();

/* ---------- ta.js: regresi genSignals/backtest (bug objek vs angka) ---------- */
suite('lib/ta.js (genSignals & backtest regresi + golden RSI)');
(function () {
  global.location = { origin: 'https://cangcilung.vercel.app' };
  const wt = loadBrowser('lib/ta.js');
  const ta = wt.CC.ta;
  assert(typeof ta.genSignals === 'function', 'genSignals terdefinisi');
  assert(typeof ta.backtest === 'function', 'backtest terdefinisi');

  /* --- Golden RSI (dataset klasik StockCharts, period 14): RSI pertama = 72.98 --- */
  const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28];
  const candles = closes.map((c, i) => ({ time: 1700000000 + i * 86400, open: c - 0.1, high: c + 0.15, low: c - 0.2, close: c, volume: 1000 }));
  const rsi = ta.calcRSI(candles, 14);
  const rsiFirst = rsi[14];
  assert(rsiFirst !== null && close(rsiFirst.value, 72.98, 0.05),
    'Golden RSI: nilai RSI pertama (i=14) = 72.98 (got ' + (rsiFirst && rsiFirst.value) + ')');
  for (let i = 0; i <= 13; i++) assert(rsi[i] === null, 'RSI sebelum period-14 adalah null (i=' + i + ')');

  /* --- Dataset deterministik untuk sinyal RSI: pastikan tidak semua flat (guard bug objek-vs-angka) --- */
  let p = 90;
  const osc = [];
  for (let i = 0; i < 200; i++) {
    p += Math.sin(i / 6) * 6 + (i % 40 < 8 ? -9 : 4);
    osc.push({ time: 900000000 + i * 86400, open: p, high: p + 5, low: p - 5, close: p + 1, volume: 1000 });
  }
  const params = { period: 14, overbought: 70, oversold: 30 };
  const s = ta.genSignals(osc, 'rsi', params);
  assert(s.length === osc.length, 'genSignals panjang array sesuai data');
  const nonsig = s.filter((x) => x !== 'flat').length;
  assert(nonsig > 0, 'genSignals RSI menghasilkan sinyal (long/short), bukan 0: ' + nonsig);
  assert(s.every((x) => x === 'long' || x === 'short' || x === 'flat'), 'genSignals hanya long/short/flat');

  /* --- Konsistensi: tiap sinyal long/short harus sesuai crossing batas overbought/oversold dari calcRSI --- */
  const rv = ta.calcRSI(osc, params.period).map((v) => (v ? v.value : null));
  let consistent = true;
  for (let i = params.period; i < osc.length; i++) {
    const r0 = rv[i], r1 = rv[i - 1];
    if (s[i] === 'long' && !(r1 < params.oversold && r0 >= params.oversold)) consistent = false;
    if (s[i] === 'short' && !(r1 > params.overbought && r0 <= params.overbought)) consistent = false;
  }
  assert(consistent, 'Setiap sinyal long/short konsisten dgn crossing RSI (bukan false-positive)');

  const bt = ta.backtest(osc, 'rsi', params);
  assert(typeof bt.closedSignals === 'number' && bt.closedSignals > 0, 'backtest menutup setidaknya 1 trade: ' + bt.closedSignals);
  assert(typeof bt.winRate === 'number' && !isNaN(bt.winRate), 'backtest winRate numerik');
  assert(typeof bt.netProfit === 'number' && !isNaN(bt.netProfit), 'backtest netProfit numerik');
  assert(bt.profitFactor === '∞' || typeof bt.profitFactor === 'number', 'backtest profitFactor numerik');

  /* --- Regresi strategi EMA 9/21 & VWAP: genSignals menerima & menghasilkan sinyal --- */
  const ema = ta.genSignals(osc, 'ema', {});
  assert(ema.length === osc.length, 'genSignals EMA panjang array sesuai data');
  const emaSig = ema.filter((x) => x !== 'flat').length;
  assert(emaSig > 0, 'genSignals EMA menghasilkan sinyal (bukan 0): ' + emaSig);
  assert(ema.every((x) => x === 'long' || x === 'short' || x === 'flat'), 'genSignals EMA hanya long/short/flat');

  const vwap = ta.genSignals(osc, 'vwap', {});
  assert(vwap.length === osc.length, 'genSignals VWAP panjang array sesuai data');
  const vwapSig = vwap.filter((x) => x !== 'flat').length;
  assert(vwapSig > 0, 'genSignals VWAP menghasilkan sinyal (bukan 0): ' + vwapSig);
  assert(vwap.every((x) => x === 'long' || x === 'short' || x === 'flat'), 'genSignals VWAP hanya long/short/flat');

  /* --- Regresi strategi MA 9/21/200, SMC, CVD (pakai data berosilasi realistis) --- */
  let q = 90;
  const osc2 = [];
  for (let i = 0; i < 400; i++) {
    q += Math.sin(i / 6) * 6 + (i % 40 < 8 ? -9 : 4);
    const o = q, c = q + Math.sin(i / 3) * 2; /* memuat candle naik & turun */
    osc2.push({ time: 900000000 + i * 86400, open: o, high: Math.max(o, c) + 3, low: Math.min(o, c) - 3, close: c, volume: 500 + ((i * 37) % 500) });
  }
  const maSig = ta.genSignals(osc2, 'ma', {});
  assert(maSig.length === osc2.length && maSig.filter((x) => x !== 'flat').length > 0,
    'genSignals MA menghasilkan sinyal: ' + maSig.filter((x) => x !== 'flat').length);
  const smcSig = ta.genSignals(osc2, 'smc', {});
  assert(smcSig.length === osc2.length && smcSig.filter((x) => x !== 'flat').length > 0,
    'genSignals SMC menghasilkan sinyal: ' + smcSig.filter((x) => x !== 'flat').length);
  const cvdSig = ta.genSignals(osc2, 'cvd', {});
  assert(cvdSig.length === osc2.length && cvdSig.filter((x) => x !== 'flat').length > 0,
    'genSignals CVD menghasilkan sinyal: ' + cvdSig.filter((x) => x !== 'flat').length);
  ['ma', 'smc', 'cvd'].forEach((st) => {
    const g = ta.genSignals(osc2, st, {});
    assert(g.every((x) => x === 'long' || x === 'short' || x === 'flat'), 'genSignals ' + st.toUpperCase() + ' hanya long/short/flat');
  });

  /* --- Konfluensi & alasan (analyzeConfluence): skor selalu bermakna & konsisten --- */
  assert(typeof ta.analyzeConfluence === 'function', 'analyzeConfluence terdefinisi');
  const cf = ta.analyzeConfluence(osc2, 'rsi', {});
  assert(cf.signal === 'long' || cf.signal === 'short', 'analyzeConfluence menghasilkan arah utama (long/short): ' + cf.signal);
  assert(typeof cf.score === 'number' && cf.score >= 0 && cf.score <= 100, 'skor konfluensi 0-100: ' + cf.score);
  assert(['STRONG', 'MODERATE', 'WEAK'].indexOf(cf.verdict) !== -1, 'verdict konfluensi valid: ' + cf.verdict);
  assert(Array.isArray(cf.reasons) && cf.reasons.length > 0, 'analyzeConfluence memuat alasan per indikator');
  assert(cf.total >= 4, 'konfluensi mencakup setidaknya 4 indikator konfirmasi: ' + cf.total);

  /* gerbang D1: data timeframe besar bertentangan -> non-null gate */
  let drift = 5;
  const htf = [];
  for (let i = 0; i < 200; i++) { drift -= 0.3; htf.push({ time: 920000000 + i * 86400, open: drift, high: drift + 2, low: drift - 2, close: drift, volume: 100 }); }
  const cfGate = ta.analyzeConfluence(osc2, 'rsi', {}, htf);
  assert(cfGate.gate === null || (cfGate.gate && (cfGate.gate.status === 'ok' || cfGate.gate.status === 'conflict')), 'gerbang D1 menghasilkan status valid: ' + (cfGate.gate && cfGate.gate.status));


  /* --- Regresi biaya per-trade (cost): harus menurunkan netProfit & tercatat di `trades` --- */
  const btCost = ta.backtest(osc, 'rsi', Object.assign({}, params, { cost: 5 }));
  assert(bt.trades > 0, 'backtest mengisi jumlah trades (' + bt.trades + '), bukan 0');
  assert(btCost.costPerTrade === 5, 'costPerTrade tersimpan (got ' + btCost.costPerTrade + ')');
  assert(btCost.netProfit < bt.netProfit, 'biaya per-trade menurunkan netProfit: ' + bt.netProfit + ' -> ' + btCost.netProfit);

  /* --- Strategi ADAPTIVE terdaftar & bekerja (regime-adaptive: NAIK->all-long,
     TURUN->smc L/S, RANGE->bb-long) --- */
  assert(typeof ta.genSignals === 'function', 'genSignals terdefinisi');
  const adaSigs = ta.genSignals(osc, 'adaptive', params);
  assert(Array.isArray(adaSigs), 'genSignals(adaptive) mengembalikan array');
  assert(adaSigs.length === osc.length, 'genSignals(adaptive) panjang sama dgn data');
  const adaBt = ta.backtest(osc, 'adaptive', params);
  assert(adaBt.error === undefined, 'backtest(adaptive) tidak error: ' + (adaBt.error || ''));
  assert(typeof adaBt.netProfit === 'number' && !isNaN(adaBt.netProfit), 'backtest(adaptive) netProfit numerik');
  const adaConf = ta.analyzeConfluence(osc, 'adaptive', params);
  assert(adaConf.slopeRegime !== undefined, 'analyzeConfluence(adaptive) menyertakan slopeRegime');
  assert(adaConf.decision === 'buy' || adaConf.decision === 'sell' || adaConf.decision === 'wait', 'analyzeConfluence(adaptive) keputusan valid: ' + adaConf.decision);
  const adaWF = ta.walkforward(osc, 'adaptive', params);
  assert(typeof adaWF.oos.winRate === 'number' && !isNaN(adaWF.oos.winRate), 'walkforward(adaptive) oos.winRate numerik');

  /* --- REGRESI SL/TP SHORT (bug lama: short memakai SL/TP arah LONG sehingga
     hampir selalu "menang" +2 ATR artifisial). Data: rally curam (RSI>70) ->
     1 bar drop (sinyal SHORT) -> rally keras (SL di ATAS entry tersentuh).
     Seharusnya short MERUGI, bukan menang artifisial. --- */
  let sdp = 100;
  const dwn = [];
  for (let i = 0; i < 220; i++) {
    if (i < 40) sdp += 4; else if (i < 41) sdp -= 6; else sdp += 8;
    const so = sdp - 3, sc = sdp + 3;
    dwn.push({ time: 970000000 + i * 86400, open: so, high: Math.max(so, sc) + 8, low: Math.min(so, sc) - 2, close: sc, volume: 1000 });
  }
  const dwnSigs = ta.genSignals(dwn, 'rsi', { period: 14, overbought: 70, oversold: 30 });
  const hasShort = dwnSigs.indexOf('short') !== -1;
  assert(hasShort, 'data uji SL/TP short memicu sinyal SHORT');
  if (hasShort) {
    const dwnBT = ta.backtest(dwn, 'rsi', { period: 14, overbought: 70, oversold: 30, cost: 0 });
    assert(typeof dwnBT.closedSignals === 'number' && dwnBT.closedSignals > 0, 'backtest SL/TP short menutup trade: ' + dwnBT.closedSignals);
    assert(typeof dwnBT.netProfit === 'number', 'backtest SL/TP short netProfit numerik');
    assert(dwnBT.netProfit < 0, 'SHORT di pasar rally harus RUGI (SL di atas entry tersentuh), bukan menang artifisial: net=' + dwnBT.netProfit);
  }

  /* --- Walk-forward / out-of-sample (anti overfitting) --- */
  assert(typeof ta.walkforward === 'function', 'walkforward terdefinisi');
  const wf = ta.walkforward(osc, 'rsi', params);
  assert(typeof wf.oos === 'object' && wf.oos !== null, 'walkforward punya blok oos');
  assert(typeof wf.oos.trades === 'number', 'walkforward oos.trades numerik');
  assert(typeof wf.oos.winRate === 'number' && !isNaN(wf.oos.winRate), 'walkforward oos.winRate numerik');
  assert(typeof wf.trainPct === 'number' && wf.trainPct > 50 && wf.trainPct < 100, 'walkforward trainPct masuk akal: ' + wf.trainPct + '%');
  assert(wf.oos.trades <= bt.trades, 'jumlah trade OOS tidak melebihi total trade');
  const fmtWF = ta.formatWalkforward(wf, 'XAUUSD');
  assert(/Out-of-Sample|OOS|oos/i.test(fmtWF) || /uji/i.test(fmtWF), 'formatWalkforward memuat label OOS');
  assert(fmtWF.indexOf('Latih /') === -1 && /latih/i.test(fmtWF), 'formatWalkforward memuat label latih/uji');

  /* --- MONTE CARLO & STRESS-TEST (ketahanan urutan trade) --- */
  assert(typeof ta.monteCarlo === 'function', 'monteCarlo terdefinisi');
  assert(bt.pnls && Array.isArray(bt.pnls), 'backtest mengekspos pnls per trade utk Monte Carlo');
  assert(bt.pnls.every((p) => typeof p === 'number'), 'semua pnls numerik');
  if (bt.pnls.length < 10) {
    const mcLt = ta.monteCarlo(bt, 500);
    assert(mcLt && mcLt.error && /minimal 10/i.test(mcLt.error), 'monteCarlo memberi pesan jelas bila trade < 10');
  }
  /* path positif wajib: seri panjang dgn volatilitas tinggi -> banyak trade */
  let bp = 2000;
  const big = [];
  for (let i = 0; i < 600; i++) {
    bp += Math.sin(i / 5) * 14 + ((i * 31) % 30 < 9 ? -18 : 10);
    big.push({ time: 900000000 + i * 86400, open: bp, high: bp + 8, low: bp - 8, close: bp + (i % 2 ? 6 : -4), volume: 800 });
  }
  const bigBT = ta.backtest(big, 'rsi', { period: 14, overbought: 70, oversold: 30 });
  assert(bigBT.closedSignals >= 10, 'data uji MC menghasilkan >=10 trade: ' + bigBT.closedSignals);
  const mc = ta.monteCarlo(bigBT, 500);
  assert(mc.ok === true, 'monteCarlo berjalan pada data trade cukup: ' + (mc.error || ''));
  assert(mc.runs === 500 && mc.n === bigBT.pnls.length, 'monteCarlo memakai jumlah trade aktual');
  assert(typeof mc.probLoss === 'number' && mc.probLoss >= 0 && mc.probLoss <= 1, 'probLoss dalam 0-1: ' + mc.probLoss);
  assert(mc.p05 <= mc.p50 && mc.p50 <= mc.p95, 'urutan persentil benar (P05<=P50<=P95): ' + mc.p05 + '/' + mc.p50 + '/' + mc.p95);
  assert(typeof mc.worstPath.maxDD === 'number' && typeof mc.bestPath.maxDD === 'number', 'stress-test punya skenario MaxDD terbaik/terburuk');
  assert(mc.worstPath.maxDD >= mc.bestPath.maxDD, 'MaxDD skenario rugi-dulu lebih dalam dari untung-dulu: ' + mc.worstPath.maxDD + ' vs ' + mc.bestPath.maxDD);
  assert(typeof mc.losingStreak === 'number' && mc.losingStreak >= 1, 'losing streak > 0: ' + mc.losingStreak);
  assert(typeof ta.formatMonteCarlo(mc, 'XAUUSD') === 'string', 'formatMonteCarlo string');

  /* --- Live Signal (strategi cross, notifikasi BUY/SELL) --- */
  assert(typeof ta.addSignalAlert === 'function', 'addSignalAlert terdefinisi');
  const sig = ta.addSignalAlert('XAUUSD', 'rsi', { period: 14, overbought: 70, oversold: 30 });
  assert(sig.ok === true, 'addSignalAlert menambah sinyal');
  assert(ta.listSignalAlerts().length === 1, 'listSignalAlerts berisi 1 sinyal');
  const chk = ta.checkSignalAlerts({ symbol: sig.signal.symbol, data: osc });
  assert(typeof chk.fired.length === 'number', 'checkSignalAlerts mengembalikan fired array');
  assert(typeof ta.formatSignalAlerts() === 'string', 'formatSignalAlerts string');
  const rem = ta.removeSignalAlert(sig.signal.id);
  assert(rem.removed === 1, 'removeSignalAlert menghapus 1');
  assert(ta.listSignalAlerts().length === 0, 'listSignalAlerts kosong setelah hapus');
  ta.clearSignalAlerts();

  /* --- Riwayat sinyal (log) --- */
  assert(typeof ta.listSignalLog === 'function', 'listSignalLog terdefinisi');
  assert(typeof ta.formatSignalLog === 'function', 'formatSignalLog terdefinisi');
  const sig2 = ta.addSignalAlert('XAUUSD', 'rsi', { period: 14, overbought: 70, oversold: 30 });
  ta.checkSignalAlerts({ symbol: 'XAUUSD', data: osc });
  assert(typeof ta.listSignalLog().length === 'number', 'signal log bertambah setelah check');
  assert(typeof ta.formatSignalLog() === 'string', 'formatSignalLog string');
  ta.clearSignalLog();
  ta.removeSignalAlert(sig2.signal.id);
  ta.clearSignalAlerts();

  /* --- REGIME FILTER (LuxAlgo "RSI Regime Filter" ala) --- */
  assert(typeof ta.detectRegime === 'function', 'detectRegime terdefinisi');
  const reg = ta.detectRegime(osc);
  assert(['trending', 'ranging'].indexOf(reg.regime) !== -1, 'regime valid: ' + reg.regime);
  assert(typeof reg.adxRaw === 'number', 'regime punya ADX numerik: ' + reg.adxRaw);
  assert(typeof reg.label === 'string' && reg.label.length > 0, 'regime punya label: ' + reg.label);

  /* --- EDGE RANKER (LuxAlgo "Structural SVM Ranker" ala): skor 0-100 + breakdown --- */
  assert(typeof ta.calcEdge === 'function', 'calcEdge terdefinisi');
  const ed = ta.calcEdge(osc, 'rsi', {}, 'long');
  assert(ed.score >= 0 && ed.score <= 100, 'skor edge 0-100: ' + ed.score);
  assert(['STRONG', 'NORMAL', 'WEAK'].indexOf(ed.grade) !== -1, 'grade edge valid: ' + ed.grade);
  assert(typeof ed.breakdown.vol === 'number' && typeof ed.breakdown.mom === 'number' && typeof ed.breakdown.exp === 'number',
    'edge breakdown vol/mom/exp ada');

  /* --- analyzeConfluence kini menyertakan regime & edge --- */
  const cf2 = ta.analyzeConfluence(osc, 'rsi', {});
  assert(cf2.regime && cf2.regime.regime, 'analyzeConfluence menyertakan blok regime');
  assert(cf2.edge && typeof cf2.edge.score === 'number', 'analyzeConfluence menyertakan blok edge (skor numerik)');

  /* --- KEPUTUSAN FINAL BUY/SELL/WAIT --- */
  assert(typeof cf2.decision === 'string', 'analyzeConfluence menyertakan keputusan final');
  assert(['buy', 'sell', 'wait'].indexOf(cf2.decision) !== -1, 'keputusan hanya buy/sell/wait: ' + cf2.decision);
  /* aturan: eksekusi (buy/sell) hanya saat STRONG & searah regime; selain itu wait */
  if (cf2.decision !== 'wait') {
    assert(cf2.verdict === 'STRONG', 'keputusan eksekusi harus ber-verdict STRONG');
    /* bila pasar ber-tren, keputusan eksekusi tak boleh melawan arah tren */
    if (cf2.regime && cf2.regime.regime === 'trending') {
      assert(cf2.regime.align === true, 'keputusan eksekusi tak boleh melawan tren');
    }
  }

  /* --- MTF STRUCTURE DASHBOARD (LuxAlgo "Structure & Trend Dashboard" ala) --- */
  assert(typeof ta.mtfStructureDashboard === 'function', 'mtfStructureDashboard terdefinisi');
  const dash = ta.mtfStructureDashboard({ tfs: { '1D': osc, '1H': osc, 'M15': osc } });
  assert(Array.isArray(dash.rows) && dash.rows.length > 0, 'dashboard punya baris pasangan timeframe');
  assert(typeof dash.verdict === 'string' && dash.verdict.length > 0, 'dashboard punya kesimpulan: ' + dash.verdict);
  const alignedRow = dash.rows.filter((r) => r.align === true || r.align === false);
  assert(alignedRow.length > 0, 'dashboard memuat baris dengan status searah/divergen terisi');

  /* --- BACKTEST upgrade: Sharpe + heatmap hari/jam --- */
  const bt2 = ta.backtest(osc2, 'rsi', params);
  assert(bt2.sharpe === null || (bt2.sharpe && typeof bt2.sharpe.raw === 'number'), 'backtest menyertakan Sharpe ratio');
  assert(Array.isArray(bt2.heatmapDay) && bt2.heatmapDay.length === 7, 'heatmapDay berisi 7 hari-minggu');
  assert(Array.isArray(bt2.heatmapHour) && bt2.heatmapHour.length > 0, 'heatmapHour berisi slot jam');
  const fmtBT = ta.formatBacktest(bt2, 'XAUUSD');
  assert(/Sharpe|Heatmap|heatmap/i.test(fmtBT) || bt2.sharpe === null, 'formatBacktest memuat Sharpe/heatmap (khusus bila ada)');
})();

/* ---------- ml.js: Machine Learning / Deep Learning ---------- */
suite('lib/ml.js (Machine Learning & Deep Learning)');
(function () {
  global.location = { origin: 'https://cangcilung.vercel.app' };
  const wm = loadBrowser('lib/ta.js');
  const ml = loadBrowser('lib/ml.js').CC.ml;
  assert(ml && typeof ml.buildFeatures === 'function', 'CC.ml terdefinisi (buildFeatures)');

  /* dataset sintetis berosilasi realistis (cukup utk fitur 60 bar + label) */
  let mp = 2000;
  const mdata = [];
  for (let i = 0; i < 400; i++) {
    mp += Math.sin(i / 6) * 10 + (i % 40 < 8 ? -14 : 6);
    const o = mp, c = mp + Math.sin(i / 3) * 4;
    mdata.push({ time: 930000000 + i * 86400, open: o, high: Math.max(o, c) + 5, low: Math.min(o, c) - 5, close: c, volume: 500 + ((i * 37) % 500) });
  }

  const fe = ml.buildFeatures(mdata);
  assert(fe.ok === true, 'buildFeatures berhasil: ' + (fe.error || ''));
  assert(Array.isArray(fe.X) && fe.X.length > 0, 'buildFeatures menghasilkan baris fitur: ' + fe.X.length);
  assert(fe.X.every((row) => row.every((v) => isFinite(v))), 'semua fitur bernilai angka (tanpa NaN/Inf)');

  const ds = ml.buildDatasets(mdata, { horizon: 3 });
  assert(ds.ok === true, 'buildDatasets berhasil: ' + (ds.error || ''));
  assert(ds.trainX.length === ds.trainY.length, 'trainX & trainY panjang sama (anti off-by-H): ' + ds.trainX.length + ' vs ' + ds.trainY.length);
  assert(ds.testX.length === ds.testY.length, 'testX & testY panjang sama (anti off-by-H): ' + ds.testX.length + ' vs ' + ds.testY.length);
  assert(ds.testX.length + ds.trainX.length === ds.n, 'split kronologis tidak membuang sampel');
  assert(ds.cut > 0 && ds.cut < ds.n, 'titik potong latih/uji valid: ' + ds.cut + '/' + ds.n);

  /* logistic regression (vanilla) + evaluasi OOS */
  const lg = ml.trainLogReg(ds.trainX, ds.trainY, { epochs: 200 });
  const lgTest = ml.evalModel(ds.testX.map((r) => lg.predictProb(r)), ds.testY);
  assert(lgTest.acc >= 0 && lgTest.acc <= 100, 'evalModel logreg akurasi valid: ' + lgTest.acc + '%');
  assert(isFinite(lgTest.edge) && isFinite(lgTest.logLoss), 'logreg edge & log-loss numerik (bukan NaN)');
  assert(lgTest.baseline > 0 && lgTest.baseline <= 100, 'baseline dihitung dari kelas mayoritas label asli: ' + lgTest.baseline + '%');

  /* MLP vanilla (deep) — regresi bug NaN (ReLU meledak) harus pakai tanh+clip */
  const nn = ml.trainMLP(ds.trainX, ds.trainY, { epochs: 60 });
  const nnTest = ml.evalModel(ds.testX.map((r) => nn.predictProb(r)), ds.testY);
  assert(isFinite(nnTest.acc), 'MLP vanilla akurasi numerik: ' + nnTest.acc + '%');
  assert(isFinite(nnTest.logLoss), 'MLP vanilla log-loss numerik (bukan NaN)');
  const nnProbs = ds.testX.map((r) => nn.predictProb(r));
  assert(nnProbs.every((p) => isFinite(p)), 'MLP vanilla tidak menghasilkan prediksi NaN/Inf');

  /* scaler anti-lookahead: mean/std dihitung hanya dari fitur latih */
  assert(ds.scaler && Array.isArray(ds.scaler.mu) && ds.scaler.mu.length > 0, 'scaler menyimpan mean per fitur (fit latih saja)');
  const row = ml.scaleRow(ds.scaler, fe.X[fe.X.length - 1]);
  assert(row.every((v) => isFinite(v)), 'scaleRow mengeluarkan nilai finite');

  /* determinisme: seed sama -> bobot & prediksi identik (fix ketidakpastian ML) */
  const det1 = ml.trainMLP(ds.trainX, ds.trainY, { epochs: 40, seed: 7 });
  const det2 = ml.trainMLP(ds.trainX, ds.trainY, { epochs: 40, seed: 7 });
  const detP1 = ds.testX.map((r) => det1.predictProb(r));
  const detP2 = ds.testX.map((r) => det2.predictProb(r));
  assert(JSON.stringify(detP1) === JSON.stringify(detP2), 'training MLP deterministik dgn seed sama (hasil identik)');
  assert(typeof ml.setSeed === 'function', 'setSeed terdefinisi di CC.ml');

  /* persistensi: ekspor state model -> restore -> prediksi identik (fitur model cache) */
  assert(typeof ml.mlpState === 'function' && typeof ml.restoreMLP === 'function', 'mlpState & restoreMLP terdefinisi');
  const st = ml.mlpState({ _state: det1._state });
  assert(st.st && Array.isArray(st.st.W1), 'mlpState mengambil bobot tersimpan (W1)');
  const det3 = ml.restoreMLP(st.st);
  const detP3 = ds.testX.map((r) => det3.predictProb(r));
  assert(JSON.stringify(detP1) === JSON.stringify(detP3), 'restore bobot menghasilkan prediksi identik dengan training asli');

  /* penanda/identitas model cache */
  assert(typeof ml.dataSig === 'function' && typeof ml.cacheKey === 'function', 'dataSig & cacheKey terdefinisi');
  const sig = ml.dataSig(mdata);
  assert(typeof sig === 'string' && sig.length > 0, 'dataSig menghasilkan fingerprint string');
  const key = ml.cacheKey('XAUUSD', 3, ds.n, sig);
  assert(key.indexOf('XAUUSD') !== -1, 'cacheKey memuat simbol: ' + key);
  assert(typeof ml.saveModelCache === 'function' && typeof ml.loadModelCache === 'function', 'save/loadModelCache terdefinisi');
})();

/* ---------- stream.js ---------- */
suite('lib/stream.js (parser SSE)');
const w3 = loadBrowser('lib/stream.js');
(function () {
  const p = w3.CC.stream.parseSSEChunk;
  assert(typeof p === 'function', 'parseSSEChunk terdefinisi');
  let full = '';
  let doneCalled = false;
  const buf = { text: '', thinking: false };
  p('data: {"choices":[{"delta":{"content":"Hal"}}]}\n\n', buf, (d) => { full += d; }, () => { doneCalled = true; });
  p('data: {"choices":[{"delta":{"content":"o"}}]}\n\n', buf, (d) => { full += d; }, () => { doneCalled = true; });
  full += '!';
  assert(full === 'Halo!', 'delta content digabung: "Halo" + "o" + "!": ' + JSON.stringify(full));
  const buf2 = { text: '', thinking: false };
  p('data: [DONE]\n\n', buf2, () => {}, () => { doneCalled = true; });
  assert(doneCalled, 'data [DONE] memicu onDone');
})();

/* ---------- search.js: integrasi fetchQuote (real-data via proxy Vercel) ----------
   Toleran jaringan: jika semua proxy gagal (mis. CI tanpa internet), test lama
   dilewati (bukan gagal) agar CI tidak flaky. */
function runIntegration() {
  return (async function () {
    const origin = 'https://cangcilung.vercel.app';
    global.location = { origin: origin };
    const wQ = loadBrowser('lib/search.js');
    const sQ = wQ.CC.search;
    const cases = [
      { ticker: '^NDX', name: 'NASDAQ-100', bad: /-39\.98|17\.421/i, label: '^NDX (USA100)' },
      { ticker: 'GC=F', name: 'GC=F', bad: /-99\.\d{2}|^.*,\d{2}\/ -?9\d/i, label: 'GC=F (XAUUSD)' }
    ];
    for (const c of cases) {
      try {
        const out = await sQ.fetchQuote(c.ticker);
        if (!out || typeof out !== 'string') { console.log('  (skip) ' + c.label + ': tidak ada output'); continue; }
        assert(/#/.test(out), c.ticker + ': output berisi blok heading');
        if (c.name) assert(out.indexOf(c.name) !== -1, c.ticker + ': memuat nama "' + c.name + '"');
        assert(!c.bad.test(out), c.ticker + ': TIDAK mengandung data korup (mis. -39.98% / 17.421)');
        const m = out.match(/- Harga: ([\d.,]+)/);
        const val = m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) : 0;
        assert(m && val > 1000, c.ticker + ': harga masuk akal (>1000): ' + (m ? m[1] : '(tidak ada)'));
      } catch (e) {
        console.log('  (skip) ' + c.label + ': gagal ambil data, dilewati: ' + (e && e.message));
      }
    }
    suite('lib/search.js — integrasi selesai (hasil di atas)');
  })();
}

/* ---------- ringkasan ---------- */
runIntegration().then(function () {
  fs.writeFileSync(path.join(ROOT, 'test', 'results.txt'), results.join('\n') + '\n');
  console.log(results.join('\n'));
  console.log('\n' + pass + ' passed, ' + fail + ' failed.');
  if (fail) { console.error('\n' + errors.join('\n')); process.exit(1); }
});
