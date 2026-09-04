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

  /* --- Regresi biaya per-trade (cost): harus menurunkan netProfit & tercatat di `trades` --- */
  const btCost = ta.backtest(osc, 'rsi', Object.assign({}, params, { cost: 5 }));
  assert(bt.trades > 0, 'backtest mengisi jumlah trades (' + bt.trades + '), bukan 0');
  assert(btCost.costPerTrade === 5, 'costPerTrade tersimpan (got ' + btCost.costPerTrade + ')');
  assert(btCost.netProfit < bt.netProfit, 'biaya per-trade menurunkan netProfit: ' + bt.netProfit + ' -> ' + btCost.netProfit);

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
