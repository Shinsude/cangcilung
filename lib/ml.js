/* lib/ml.js — Machine Learning & Deep Learning client-side (browser, tanpa server).
   Engine:
     1) TensorFlow.js (dimuat lazy dari CDN) bila online & tersedia — deep learning sungguhan.
     2) Fallback ML Vanilla JS (from-scratch): logistic regression + MLP / deep network
        (backprop, binary cross-entropy) — offline, ringan, deterministik.
   Fitur:
     - Feature engineering dari indikator lib/ta.js (tanpa lookahead: fitur bar i hanya
       memakai data [0..i]; label memakai data ke depan).
     - Model A: PREDIKSI ARAH harga (p(naik) untuk H bar ke depan).
     - Model B: SKOR SINYAL — probabilitas sinyal BUY/SELL saat ini benar (searah).
     - mlAnalysis: latih 70% historis, uji 30% terbaru (kronologis, tanpa shuffle)
       + confusion matrix + akurasi vs baseline.
     - mlFilterBacktest: bandingkan backtest 'adaptive' murni vs +filter ML (OOS).
*/
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});
  var ta = CC.ta || {};

  var CDN_TF = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';

  // ---------- PRNG deterministik (mulberry32) ----------
  // Hasil training konsisten antar run (bukan Math.random acak).
  var _seed = 20260101;
  var _rngState = 0x9E3779B9;
  var _useSeeded = false;
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function setSeed(seed) {
    _seed = seed == null ? 42 : seed;
    _rngState = (_seed >>> 0) || 0x9E3779B9;
    _useSeeded = true;
  }
  function rnd() {
    if (!_useSeeded) return Math.random();
    _rngState += 0x6D2B79F5;
    var t = Math.imul(_rngState ^ _rngState >>> 15, 1 | _rngState);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  // ---------- persistensi model (vanilla) di localStorage ----------
  function mlCachePrefix() { return 'cc_ml_v1_'; }
  function cacheKey(sym, H, n, sig) { return 'cc_ml_v1_' + String(sym).toUpperCase() + '_h' + H + '_n' + n + '_' + sig; }
  function dataSig(data) {
    var last = data[data.length - 1] || {};
    return Math.floor(last.close * 100) + '_' + (data.length % 1000);
  }
  // daftar semua cache ML (key + ukuran) supaya bisa di-bersihkan saat kuota penuh
  function mlCacheKeys() {
    var out = [];
    if (typeof localStorage === 'undefined') return out;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(mlCachePrefix()) === 0) {
          var len = (localStorage.getItem(k) || '').length;
          out.push({ key: k, size: len });
        }
      }
    } catch (e) {}
    return out;
  }
  // buang cache ML di luar prefix yang dipertahankan (mulai dari terkecil); kembalikan jumlah terbuang
  function evictMLCaches(keepPrefixes) {
    var list = mlCacheKeys().filter(function (c) {
      for (var i = 0; i < keepPrefixes.length; i++) if (c.key.indexOf(keepPrefixes[i]) === 0) return false;
      return true;
    });
    list.sort(function (a, b) { return a.size - b.size; });
    var freed = 0;
    for (var i = 0; i < list.length && freed < 12; i++) {
      try { localStorage.removeItem(list[i].key); freed++; } catch (e) {}
    }
    return freed;
  }
  function saveModelCache(k, state) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(k, JSON.stringify(state));
    } catch (e) {
      // kuota penuh/error: buang cache ML kombinasi simbol lain (pertahankan simbol ini), coba sekali lagi
      try {
        var sym = k.slice(mlCachePrefix().length).split('_h')[0] || '';
        evictMLCaches([mlCachePrefix() + sym.toUpperCase() + '_']);
        localStorage.setItem(k, JSON.stringify(state));
      } catch (e2) {}
    }
  }
  function loadModelCache(k) {
    try {
      if (typeof localStorage === 'undefined') return null;
      var v = localStorage.getItem(k);
      if (!v) return null;
      var parsed = JSON.parse(v);
      if (!parsed || typeof parsed !== 'object' || !parsed.st || Array.isArray(parsed.st.W1) === false) return null;
      return parsed;
    } catch (e) { return null; }
  }
  // validasi integritas state (anti cache korup/versi lama) sebelum dipakai kembali
  function restoreMLP(st) {
    if (!st || typeof st !== 'object') return null;
    var W1 = st.W1, W2 = st.W2, W3 = st.W3, b1 = st.b1, b2 = st.b2;
    if (!Array.isArray(W1) || !W1.length || !Array.isArray(W1[0])) return null;
    if (!Array.isArray(W2) || !W2.length || !Array.isArray(W2[0])) return null;
    if (!Array.isArray(W3) || !Array.isArray(b1) || b1.length !== W1.length) return null;
    if (!Array.isArray(b2) || b2.length !== W2.length || W2[0].length !== W1.length) return null;
    var h1 = W1.length, h2 = W2.length, f = st.f || W1[0].length;
    for (var g = 0; g < W1.length; g++) if (W1[g].length !== f) return null;
    for (var g2 = 0; g2 < W2.length; g2++) if (W2[g2].length !== h1) return null;
    if (W3.length !== h2) return null;
    var flat = W1.concat(W2.concat([W3].concat(b1.concat(b2))));
    for (var q = 0; q < flat.length; q++) {
      var row = flat[q];
      if (Array.isArray(row)) { for (var r2 = 0; r2 < row.length; r2++) if (!isFinite(row[r2])) return null; }
      else if (!isFinite(row)) return null;
    }
    return freshMLPFromState({ f: f }, st);
  }
  // salin state bobot vanilla (tanpa fungsi) agar bisa di-serialize & dipakai ulang
  function mlpState(m) {
    if (!m || !m._state) return null;
    return { st: m._state };
  }

  // ---------- utilitas ----------
  function numVal(arr, i) { return arr && arr[i] != null && typeof arr[i] === 'object' ? arr[i].value : (arr && arr[i]); }

  // ---------- fitur (indikator) ----------
  // Kembalikan matriks fitur + nama kolom. Tanpa lookahead: baris i = fitur dari data[0..i].
  function buildFeatures(data) {
    var names = [];
    var X = [];
    if (!data || data.length < 60) return { X: X, names: names, ok: false };
    var rsi = ta.calcRSI ? ta.calcRSI(data, 14) : null;
    var macd = ta.calcMACD ? ta.calcMACD(data) : null;
    var e9 = ta.calcEMA ? ta.calcEMA(data, 9) : null;
    var e21 = ta.calcEMA ? ta.calcEMA(data, 21) : null;
    var sma50 = ta.calcSMA ? ta.calcSMA(data, 50) : null;
    var atr = ta.calcATR ? ta.calcATR(data, 14) : null;
    var bb = ta.calcBollinger ? ta.calcBollinger(data, 20, 2) : null;

    // rolling volume 20
    var vol20 = [];
    for (var i = 0; i < data.length; i++) {
      var s = 0, c0 = 0;
      for (var j = Math.max(0, i - 19); j <= i; j++) { s += (data[j].volume || 0); c0++; }
      vol20.push(c0 ? s / c0 : 0);
    }

    names = ['rsi', 'macdHist', 'emaGap', 'vsSMA50', 'atrPct', 'ret1', 'ret3', 'ret5', 'bodyRatio', 'upWick', 'volRatio', 'bbPos', 'posRange20', 'distHigh', 'distLow', 'slope5'];

    for (var i = 60; i < data.length; i++) {
      var c = data[i].close;
      var r = numVal(rsi, i);
      var h = numVal(macd && macd.histogram, i);
      var emaGap = (numVal(e9, i) - numVal(e21, i));
      var vsSma = numVal(sma50, i);
      var a = numVal(atr, i);
      var mid = bb ? numVal(bb.middle, i) : null;
      var up = bb ? numVal(bb.upper, i) : null;
      var lo = bb ? numVal(bb.lower, i) : null;
      var pc = data[i - 1] ? data[i - 1].close : c;
      var pc3 = data[i - 3] ? data[i - 3].close : c;
      var pc5 = data[i - 5] ? data[i - 5].close : c;
      var hi = data[i].high, low = data[i].low, o = data[i].open;
      var rng = (hi - low) || 1;
      // range 20
      var hi20 = -Infinity, lo20 = Infinity;
      for (var k = Math.max(0, i - 19); k <= i; k++) { if (data[k].high > hi20) hi20 = data[k].high; if (data[k].low < lo20) lo20 = data[k].low; }
      var row = [
        r == null ? 0.5 : r / 100,
        h == null ? 0 : (h / (c || 1)),
        (emaGap == null || e21 == null) ? 0 : (emaGap / (numVal(e21, i) || 1)),
        (vsSma == null) ? 0 : (c / (vsSma || 1) - 1),
        a == null ? 0 : (a / (c || 1)),
        (c / (pc || 1) - 1),
        (c / (pc3 || 1) - 1),
        (c / (pc5 || 1) - 1),
        Math.abs(c - o) / rng,
        (hi - Math.max(o, c)) / rng,
        vol20[i] ? ((data[i].volume || 0) / (vol20[i] || 1)) : 1,
        (mid == null || up == null || lo == null || (up - lo) === 0) ? 0 : (c - mid) / (up - lo),
        (hi20 === -Infinity || hi20 === lo20) ? 0.5 : (c - lo20) / (hi20 - lo20),
        (hi20 === -Infinity || a == null || a === 0) ? 0 : (hi20 - c) / a,
        (lo20 === Infinity || a == null || a === 0) ? 0 : (c - lo20) / a,
        (c / (pc5 || 1) - 1)
      ];
      X.push(row);
    }
    return { X: X, names: names, ok: true };
  }

  // z-score normalisasi: latih memakai mean/std dari data training saja (anti-lookahead)
  function fitScaler(Xrows) {
    if (!Xrows || !Xrows.length) return { mu: [], sd: [], ok: false };
    var n = Xrows.length, f = Xrows[0].length;
    var mu = new Array(f).fill(0), sd = new Array(f).fill(0);
    for (var j = 0; j < f; j++) { var s = 0; for (var i = 0; i < n; i++) s += Xrows[i][j]; mu[j] = s / n; }
    for (var j2 = 0; j2 < f; j2++) { var s2 = 0; for (var i2 = 0; i2 < n; i2++) { var d = Xrows[i2][j2] - mu[j2]; s2 += d * d; } sd[j2] = Math.sqrt(s2 / n) || 1; }
    return { mu: mu, sd: sd, ok: true };
  }
  function scaleRow(scaler, row) {
    return row.map(function (v, j) { return (v - scaler.mu[j]) / scaler.sd[j]; });
  }
  function scaleAll(scaler, rows) { return rows.map(function (r) { return scaleRow(scaler, r); }); }

  // ---------- dataset (label + split kronologis, tanpa lookahead) ----------
  // label: +1=menguat dalam H bar (harga naik), 0=tidak (untuk probabilitas P(naik))
  function buildDatasets(data, opt) {
    opt = opt || {};
    var H = opt.horizon || 3;
    var fe = buildFeatures(data);
    if (!fe.ok) return { error: 'Data terlalu sedikit / indikator tidak tersedia' };
    var X = fe.X; // baris i = fitur bar i (i=60..n-1) => indeks data = i+60
    var labels = [];
    var idx = [];
    for (var t = 0; t < X.length; t++) {
      var dIdx = t + 60;
      if (dIdx + H >= data.length) break;
      var up = data[dIdx + H].close > data[dIdx].close;
      labels.push(up ? 1 : 0);
      idx.push(dIdx);
    }
    var n = labels.length;
    if (n < 40) return { error: 'Sampel terlalu sedikit (' + n + ')' };
    var trainFrac = opt.trainFrac || 0.7;
    var cut = Math.floor(n * trainFrac);
    // hanya n baris pertama X yang punya label (H bar terakhir tidak terlabel)
    var trainRows = X.slice(0, cut), trainY = labels.slice(0, cut);
    var testRows = X.slice(cut, n), testY = labels.slice(cut);
    var scaler = fitScaler(trainRows);
    return {
      ok: true, H: H, X: X, labels: labels, idx: idx,
      trainX: scaleAll(scaler, trainRows), trainY: trainY,
      testX: scaleAll(scaler, testRows), testY: testY,
      scaler: scaler, names: fe.names, n: n, cut: cut
    };
  }

  // ---------- metrik ----------
  function evalModel(probs, testY, baselineP) {
    var n = probs.length;
    if (!n) return { error: 'tidak ada prediksi' };
    var tp = 0, fp = 0, fn = 0, tn = 0, logLoss = 0;
    for (var i = 0; i < n; i++) {
      var raw = probs[i];
      if (!isFinite(raw)) raw = 0.5;
      var p = Math.max(1e-9, Math.min(1 - 1e-9, raw));
      var y = testY[i];
      logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
      var pred = p >= 0.5 ? 1 : 0;
      if (y === 1 && pred === 1) tp++;
      else if (y === 0 && pred === 1) fp++;
      else if (y === 1 && pred === 0) fn++;
      else tn++;
    }
    var acc = (tp + tn) / n;
    var precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    var recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    var f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
    // baseline = akurasi "selalu menebak kelas mayoritas" (hanya dari label asli)
    var ups = testY.filter(function (y) { return y === 1; }).length;
    var b = baselineP != null ? baselineP : Math.max(ups, n - ups) / n;
    var edge = acc - b; // selisih akurasi vs baseline (0 = tidak lebih baik dari menebak mayoritas)
    return {
      acc: +(acc * 100).toFixed(1), precision: +(precision * 100).toFixed(1), recall: +(recall * 100).toFixed(1), f1: +(f1 * 100).toFixed(1),
      logLoss: +(logLoss / n).toFixed(4), edge: +edge.toFixed(3),
      tp: tp, fp: fp, fn: fn, tn: tn, n: n, baseline: +(b * 100).toFixed(1)
    };
  }

  // ==================== VANILLA JS (from-scratch) ====================
  // --- Logistic regression (gradient descent + L2) ---
  function trainLogReg(trainX, trainY, opt) {
    opt = opt || {};
    var f = trainX[0].length, n = trainX.length;
    var w = new Array(f).fill(0), b = 0;
    var lr = opt.lr || 0.5, epochs = opt.epochs || 300, l2 = opt.l2 || 0.001;
    function sig(z) { return 1 / (1 + Math.exp(-z)); }
    for (var e = 0; e < epochs; e++) {
      var gw = new Array(f).fill(0), gb = 0;
      for (var i = 0; i < n; i++) {
        var z = b;
        for (var j = 0; j < f; j++) z += w[j] * trainX[i][j];
        var err = sig(z) - trainY[i];
        for (var j2 = 0; j2 < f; j2++) gw[j2] += err * trainX[i][j2];
        gb += err;
      }
      for (var j3 = 0; j3 < f; j3++) w[j3] -= lr * (gw[j3] / n + l2 * w[j3]);
      b -= lr * (gb / n);
    }
    function predictProb(x) {
      var z = b;
      for (var j = 0; j < f; j++) z += w[j] * x[j];
      return 1 / (1 + Math.exp(-z));
    }
    return { kind: 'Logistic Regression', engine: 'vanilla', predictProb: predictProb };
  }

  // --- Deep MLP (vanilla): 2 hidden layer tanh + sigmoid output, backprop, binary CE ---
  // Core dipisah (mlpEpoch/forward) agar bisa jalan sinkron (tes) DAN async-chunked (UI anti-freeze),
  // deterministik via PRNG ber-seed, serta bobot bisa disimpan/dipulihkan (persisten).
  function mlpEpoch(S, trainX, trainY, opt) {
    var f = opt._f, h1 = S.h1, h2 = S.h2;
    var lr = opt.lr || 0.03, l2 = opt.l2 || 0.001;
    var W1 = S.W1, b1 = S.b1, W2 = S.W2, b2 = S.b2, W3 = S.W3, b3 = S.b3;
    function sig(z) { z = Math.max(-30, Math.min(30, z)); return 1 / (1 + Math.exp(-z)); }
    function tanh(x) { x = Math.max(-20, Math.min(20, x)); return Math.tanh(x); }
    function tanhD(x) { var t = Math.tanh(x); return 1 - t * t; }
    function clip(x) { return Math.max(-5, Math.min(5, x)); }
    for (var sInd = 0; sInd < trainX.length; sInd++) {
      var x = trainX[sInd];
      var a1 = new Array(h1), z1 = new Array(h1);
      for (var i3 = 0; i3 < h1; i3++) { z1[i3] = b1[i3]; for (var j3 = 0; j3 < f; j3++) z1[i3] += W1[i3][j3] * x[j3]; a1[i3] = tanh(z1[i3]); }
      var a2 = new Array(h2), z2 = new Array(h2);
      for (var i4 = 0; i4 < h2; i4++) { z2[i4] = b2[i4]; for (var j4 = 0; j4 < h1; j4++) z2[i4] += W2[i4][j4] * a1[j4]; a2[i4] = tanh(z2[i4]); }
      var z3 = b3; for (var j5 = 0; j5 < h2; j5++) z3 += W3[j5] * a2[j5];
      var a3 = sig(z3);
      var d3 = clip(a3 - trainY[sInd]);
      for (var j6 = 0; j6 < h2; j6++) { W3[j6] -= lr * (d3 * a2[j6] + l2 * W3[j6]); }
      b3 -= lr * d3;
      var d2 = new Array(h2);
      for (var i5 = 0; i5 < h2; i5++) { d2[i5] = clip(d3 * W3[i5] * tanhD(z2[i5])); }
      for (var i6 = 0; i6 < h2; i6++) { for (var j7 = 0; j7 < h1; j7++) { W2[i6][j7] -= lr * (d2[i6] * a1[j7] + l2 * W2[i6][j7]); } b2[i6] -= lr * d2[i6]; }
      var d1 = new Array(h1);
      for (var i7 = 0; i7 < h1; i7++) { var sAcc = 0; for (var j8 = 0; j8 < h2; j8++) sAcc += d2[j8] * W2[j8][i7]; d1[i7] = clip(sAcc * tanhD(z1[i7])); }
      for (var i8 = 0; i8 < h1; i8++) { for (var j9 = 0; j9 < f; j9++) { W1[i8][j9] -= lr * (d1[i8] * x[j9] + l2 * W1[i8][j9]); } b1[i8] -= lr * d1[i8]; }
    }
    S.b3 = b3;
  }
  function freshMLP(f, h1, h2) {
    function xavier(nIn) { return (rnd() * 2 - 1) * Math.sqrt(1 / nIn); }
    var W1 = [], b1 = [];
    for (var i = 0; i < h1; i++) { var r = []; for (var j = 0; j < f; j++) r.push(xavier(f)); W1.push(r); b1.push(0); }
    var W2 = [], b2 = [];
    for (var i2 = 0; i2 < h2; i2++) { var r2 = []; for (var j2 = 0; j2 < h1; j2++) r2.push(xavier(h1)); W2.push(r2); b2.push(0); }
    var W3 = new Array(h2).fill(0).map(function () { return xavier(h2); });
    return { h1: h1, h2: h2, W1: W1, b1: b1, W2: W2, b2: b2, W3: W3, b3: 0 };
  }
  function freshMLPFromState(K, st) {
    if (st && K && K.f) st.f = K.f;
    function sig(z) { z = Math.max(-30, Math.min(30, z)); return 1 / (1 + Math.exp(-z)); }
    function tanh(x) { x = Math.max(-20, Math.min(20, x)); return Math.tanh(x); }
    function predictProb(xrow) {
      var f = K.f, h1 = st.h1, h2 = st.h2;
      var a1 = new Array(h1), z1 = new Array(h1);
      for (var i = 0; i < h1; i++) { z1[i] = st.b1[i]; for (var j = 0; j < f; j++) z1[i] += st.W1[i][j] * xrow[j]; a1[i] = tanh(z1[i]); }
      var a2 = new Array(h2), z2 = new Array(h2);
      for (var i2 = 0; i2 < h2; i2++) { z2[i2] = st.b2[i2]; for (var j2 = 0; j2 < h1; j2++) z2[i2] += st.W2[i2][j2] * a1[j2]; a2[i2] = tanh(z2[i2]); }
      var z3 = st.b3; for (var j3 = 0; j3 < h2; j3++) z3 += st.W3[j3] * a2[j3];
      return sig(z3);
    }
    return { kind: 'Deep MLP (vanilla)', engine: 'vanilla', predictProb: predictProb, _state: st };
  }
  function trainMLP(trainX, trainY, opt) {
    opt = opt || {};
    var f = trainX[0].length;
    var h1 = opt.h1 || 16, h2 = opt.h2 || 8;
    var epochs = opt.epochs || 500;
    if (typeof opt.seed === 'number') setSeed(opt.seed);
    var S = freshMLP(f, h1, h2);
    opt._f = f;
    for (var e = 0; e < epochs; e++) mlpEpoch(S, trainX, trainY, opt);
    return freshMLPFromState({ f: f }, S);
  }
  // versi async: chunk ber-epoch -> setTimeout antara blok -> UI tidak beku; deterministik tetap.
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function trainMLPAsync(trainX, trainY, opt, onProgress) {
    opt = opt || {};
    var f = trainX[0].length;
    var h1 = opt.h1 || 16, h2 = opt.h2 || 8;
    var epochs = opt.epochs || 500;
    var chunk = opt.chunk || 40;
    if (typeof opt.seed === 'number') setSeed(opt.seed);
    var S = freshMLP(f, h1, h2);
    opt._f = f;
    var e = 0;
    function next() {
      return new Promise(function (res) {
        setTimeout(function () {
          var end = Math.min(epochs, e + chunk);
          for (; e < end; e++) mlpEpoch(S, trainX, trainY, opt);
          if (onProgress) onProgress(e, epochs);
          if (e < epochs) res(next());
          else res(null);
        }, 0);
      });
    }
    return next().then(function () { return freshMLPFromState({ f: f }, S); });
  }

  // ---------- TensorFlow.js (deep learning sungguhan) ----------
  function tfAvailable() { return typeof window !== 'undefined' && typeof window.tf === 'object' && window.tf && window.tf.layers; }

  // Muat TF.js sekali dari CDN (online). Gagal/offline → pakai fallback vanilla.
  function loadTF(timeoutMs) {
    return new Promise(function (resolve) {
      if (tfAvailable()) return resolve(true);
      if (typeof document === 'undefined' || typeof document.createElement !== 'function') return resolve(false);
      try {
        var s = document.createElement('script');
        s.src = CDN_TF;
        s.async = true;
        var done = false;
        function fin(ok) { if (!done) { done = true; resolve(ok); } }
        s.onload = function () { fin(tfAvailable()); };
        s.onerror = function () { fin(false); };
        document.head.appendChild(s);
        setTimeout(function () { fin(tfAvailable()); }, timeoutMs || 8000);
      } catch (e) { resolve(false); }
    });
  }

  function trainTF(trainX, trainY, opt) {
    opt = opt || {};
    return new Promise(function (resolve, reject) {
      try {
        var tf = window.tf;
        tf.tidy(function () {
          var xs = tf.tensor2d(flat2d(trainX), [trainX.length, trainX[0].length]);
          var ys = tf.tensor1d(trainY, 'int32');
          var model = tf.sequential();
          model.add(tf.layers.dense({ units: opt.h1 || 20, activation: 'relu', inputShape: [trainX[0].length] }));
          model.add(tf.layers.dense({ units: opt.h2 || 10, activation: 'relu' }));
          model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
          model.compile({ optimizer: tf.train.adam(opt.lr || 0.01), loss: 'binaryCrossentropy', metrics: ['accuracy'] });
          var hist = model.fit(xs, ys, { epochs: opt.epochs || 160, batchSize: opt.batchSize || 32, shuffle: false, verbose: 0 });
          hist.then(function () {
            var model2 = model;
            xs.dispose(); ys.dispose();
            function predictProb(xrow) {
              var t = tf.tensor2d([xrow], [1, xrow.length]);
              var p = model2.predict(t);
              var v = p.dataSync()[0];
              t.dispose(); p.dispose();
              return v;
            }
            resolve({ kind: 'Deep Neural Network (TensorFlow.js)', engine: 'tfjs', predictProb: predictProb });
          }).catch(function (e) { reject(e); });
        });
      } catch (e) { reject(e); }
    });
  }
  function flat2d(rows) { var out = new Float32Array(rows.length * rows[0].length); var k = 0; for (var i = 0; i < rows.length; i++) for (var j = 0; j < rows[0].length; j++) out[k++] = rows[i][j]; return out; }

  // ==================== API PUBLIK ====================

  function engine() { return tfAvailable() ? 'tfjs' : 'vanilla'; }

  // Latih model arah (Model A). engineRef: 'auto' | 'tfjs' | 'vanilla'.
  // Deterministik (seed default 42) + UI anti-freeze (training vanilla di-chunk via setTimeout,
  // kecuali opt.sync untuk keperluan tes/library). Progress via opt.onProgress(e, total).
  function trainDirection(data, opt) {
    opt = opt || {};
    if (opt.seed == null) opt.seed = 42;
    var ds = buildDatasets(data, opt);
    if (ds.error) return Promise.resolve({ error: ds.error });
    var wantTF = opt.engine !== 'vanilla';
    function buildReport(model) {
      var tr = evalModel(ds.trainX.map(function (r) { return model.predictProb(r); }), ds.trainY);
      var te = evalModel(ds.testX.map(function (r) { return model.predictProb(r); }), ds.testY, ds.trainY.filter(function (y) { return y === 1; }).length / ds.trainY.length);
      return { ok: true, engine: model.engine, kind: model.kind, model: model, train: tr, test: te, scaler: ds.scaler, names: ds.names, ds: ds, H: ds.H, seed: opt.seed };
    }
    function runVanilla() {
      try {
        if (opt.sync) return Promise.resolve(buildReport(trainMLP(ds.trainX, ds.trainY, opt)));
        return trainMLPAsync(ds.trainX, ds.trainY, opt, opt.onProgress).then(buildReport);
      } catch (e) { return Promise.resolve({ error: 'Pelatihan gagal: ' + e.message }); }
    }
    if (!wantTF) return runVanilla();
    return loadTF(6000).then(function (tfOk) {
      if (tfOk) {
        return trainTF(ds.trainX, ds.trainY, opt).then(buildReport).catch(function () { return runVanilla(); });
      }
      return runVanilla();
    });
  }

  // Prediksi arah bar terakhir: p(naik) untuk H bar ke depan. Re-train kecil agar up-to-date.
  function predictDirection(data, opt) {
    opt = opt || {};
    return trainDirection(data, opt).then(function (r) {
      if (r.error) return r;
      var lastFeature = r.ds.X[r.ds.X.length - 1];
      var p = r.model.predictProb(scaleRow(r.scaler, lastFeature));
      var conf = Math.abs(p - 0.5) * 2; // 0..1
      return {
        ok: true, engine: r.model.engine, kind: r.model.kind,
        pUp: +p.toFixed(3), pDown: +(1 - p).toFixed(3),
        side: p >= 0.5 ? 'long' : 'short',
        confidence: +(conf * 100).toFixed(0),
        strength: conf >= 0.5 ? 'KUAT' : conf >= 0.25 ? 'SEDANG' : 'LEMAH',
        H: r.H,
        train: r.train, test: r.test
      };
    });
  }

  // Model B: skor sinyal — probabilitas sinyal BUY/SELL saat ini benar dst.
  // Gunakan sinyal terakhir dari strategi + probabilitas arah dari Model A.
  // Efisien: bila opt.pre (hasil predictDirection) diberikan, arah tidak dilatih ulang.
  function scoreSignal(data, strategy, params, opt) {
    opt = opt || {};
    strategy = (strategy || 'adaptive').toLowerCase();
    var build= function (m) {
      if (m.error) return m;
      var sigs = ta.genSignals ? ta.genSignals(data, strategy, params) : null;
      var primary = 'flat';
      if (sigs) { for (var i = sigs.length - 1; i >= 0; i--) { if (sigs[i] !== 'flat') { primary = sigs[i]; break; } } }
      var verdict;
      var alignProb;
      if (primary === 'long') { alignProb = m.pUp; verdict = alignProb >= 0.55 ? 'BUY diizinkan' : 'BUY lemah'; }
      else if (primary === 'short') { alignProb = m.pDown; verdict = alignProb >= 0.55 ? 'SELL diizinkan' : 'SELL lemah'; }
      else { alignProb = Math.max(m.pUp, m.pDown); verdict = 'WAIT (tak ada sinyal)'; }
      return {
        ok: true, engine: m.engine, strategy: strategy,
        signal: primary, pDirectionUp: m.pUp, pDirectionDown: m.pDown,
        pSignalCorrect: +(alignProb).toFixed(3), confidence: m.confidence, verdict: verdict, H: m.H
      };
    };
    if (opt.pre) return Promise.resolve(build(opt.pre));
    return predictDirection(data, opt).then(build);
  }

  // Format laporan Model A (training/testing) — Bahasa Indonesia
  function formatMl(m, symbol) {
    if (!m || m.error) return '⚠️ ML gagal: ' + (m && m.error);
    var out = '## 🧠 Machine Learning — ' + (symbol || 'XAUUSD').toUpperCase() + '\n\n';
    out += '**Engine:** ' + m.engine + (m.engine === 'tfjs' ? ' (TensorFlow.js di browser)' : ' (neural net vanilla, offline)') + '\n';
    out += '**Model:** ' + m.kind + ' · horizon **' + m.H + ' bar** ke depan\n\n';
    out += '### Validasi (kronologis: latih ' + m.ds.cut + ' / 70%, uji ' + (m.ds.n - m.ds.cut) + ' sampel terbaru, tanpa shuffle)\n';
    out += '| Metrik | Training | **Test (OOS)** |\n|---|---:|---:|\n';
    out += '| Akurasi | ' + m.train.acc + '% | **' + m.test.acc + '%** |\n';
    out += '| Precision | ' + m.train.precision + '% | ' + m.test.precision + '% |\n';
    out += '| Recall | ' + m.train.recall + '% | ' + m.test.recall + '% |\n';
    out += '| F1 | ' + m.train.f1 + '% | ' + m.test.f1 + '% |\n';
    out += '| Log-loss | ' + m.train.logLoss + ' | ' + m.test.logLoss + ' |\n\n';
    out += '**Akurasi test ' + m.test.acc + '%** vs baseline (menebak kelas mayoritas) ' + m.test.baseline + '% — edge **' + (m.test.edge >= 0 ? '+' : '') + (m.test.edge * 100).toFixed(1) + '%**.\n';
    out += (m.test.edge > 0.02 ? '✅ Model lebih baik dari menebak (edge positif nyata).' : (m.test.edge >= 0 ? '🟡 Model setara dengan menebak — belum ada edge kuat.' : '🟠 Model di bawah baseline — fitur/sinyal lemah.'));
    out += (m.engine === 'tfjs' ? '\n_<small>Dilatih langsung di browser via TensorFlow.js (CDN).</small>_' : '\n_<small>Offline: dipakai neural network murni JS dari nol (tanpa CDN).</small>_');
    if (m.cached) out += '\n⚡ Model dimuat dari cache tersimpan (training ulang dilewati — hasil identik, deterministik seed ' + m.seed + ').';
    return out;
  }

  // Format prediksi live
  function formatPredict(p, symbol) {
    if (!p || p.error) return '⚠️ ML gagal: ' + (p && p.error);
    var up = '🟢 NAIK **' + (p.pUp * 100).toFixed(1) + '%**';
    var dn = '🔴 TURUN **' + (p.pDown * 100).toFixed(1) + '%**';
    var out = '## 🔮 Prediksi ML — ' + (symbol || 'XAUUSD').toUpperCase() + '\n\n';
    out += 'Model **' + p.kind + '** · engine **' + p.engine + '** · horizon ' + p.H + ' bar\n\n';
    out += up + '  vs  ' + dn + '\n\n';
    out += 'Bias model: **' + (p.side === 'long' ? 'NAIK' : 'TURUN') + '** · keyakinan ' + p.strength + ' (' + p.confidence + '/100)\n\n';
    out += 'Akurasi latih: ' + p.train.acc + '% · test (OOS): **' + p.test.acc + '%** (baseline ' + p.test.baseline + '%)';
    return out;
  }

  // Format skor sinyal
  function formatSignalScore(s, symbol) {
    if (!s || s.error) return '⚠️ ML gagal: ' + (s && s.error);
    var out = '## 🎯 Skor Sinyal ML — ' + (symbol || 'XAUUSD').toUpperCase() + ' (' + s.strategy.toUpperCase() + ')\n\n';
    out += 'Sinyal saat ini: **' + (s.signal === 'long' ? 'BUY ▲' : s.signal === 'short' ? 'SELL ▼' : 'FLAT ⏳') + '**\n';
    out += 'Probabilitas arah ML: NAIK ' + (s.pDirectionUp * 100).toFixed(1) + '% · TURUN ' + (s.pDirectionDown * 100).toFixed(1) + '%\n';
    out += 'Probabilitas sinyal **benar**: **' + (s.pSignalCorrect * 100).toFixed(1) + '%**\n';
    out += 'Keputusan ML: **' + s.verdict + '**\n';
    out += '_Engine: ' + s.engine + '._';
    return out;
  }

  CC.ml = {
    engine: engine,
    loadTF: loadTF,
    buildFeatures: buildFeatures,
    buildDatasets: buildDatasets,
    fitScaler: fitScaler,
    scaleRow: scaleRow,
    scaleAll: scaleAll,
    evalModel: evalModel,
    trainLogReg: trainLogReg,
    trainMLP: trainMLP,
    trainMLPAsync: trainMLPAsync,
    trainTF: trainTF,
    trainDirection: trainDirection,
    predictDirection: predictDirection,
    scoreSignal: scoreSignal,
    formatMl: formatMl,
    formatPredict: formatPredict,
    formatSignalScore: formatSignalScore,
    setSeed: setSeed,
    cacheKey: cacheKey,
    dataSig: dataSig,
    saveModelCache: saveModelCache,
    loadModelCache: loadModelCache,
    mlCacheKeys: mlCacheKeys,
    evictMLCaches: evictMLCaches,
    mlpState: mlpState,
    restoreMLP: restoreMLP
  };
})();

// Catatan pemakaian (tidak dieksekusi): 
//   RESTORE: freshMLPFromState dipakai agar bobot tersimpan (JSON) bisa langsung dipakai
//   tanpa training ulang — hasil identik deterministik (seed 42 default).