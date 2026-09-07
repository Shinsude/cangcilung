/* lib/affiliate.js — AI ML & DL untuk Affiliator Penjualan (browser, tanpa server).
   Engine:
     - Feature engineering dari data produk/traffic affiliasi (tanpa lookahead).
     - Model A: PREDIKSI PROFITABILITAS — p(produk menguntungkan) utk tiap produk.
     - Model B: FORECAST PENDAPATAN — proyeksi pendapatan periode berikutnya.
     - Analyzer: ringkasan deskriptif penjualan/platform/konten/niche.
     - Optimizer: rekomendasi produk mana digenjot/hentikan + alokasi konten/platform.
     - Strategi: panduan langkah demi langkah utk affiliator.
   Reuse: struktur training ML (MLP/logreg/deterministik) dari lib/ml.js (CC.ml).
*/
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});
  var ml = CC.ml || {};
  var storage = CC.storage || {};

  var STORAGE_KEY = 'cc_affiliates_v1';
  var STORAGE_KEY_MODEL = 'cc_aff_model_v1';

  // ---------- normalisasi angka ----------
  function num(v, def) {
    var n = Number(v);
    return isFinite(n) ? n : (def == null ? 0 : def);
  }

  // ---------- CRUD produk ----------
  function getProducts() {
    return (CC.affCache || []).slice();
  }
  function setProducts(list) {
    CC.affCache = (list || []).slice();
    return CC.affCache;
  }
  function loadProducts() {
    try {
      if (storage && storage.get) {
        return Promise.resolve(storage.get(STORAGE_KEY, [])).then(function (v) {
          var list = Array.isArray(v) ? v : [];
          setProducts(list);
          return list;
        }).catch(function () { return Promise.resolve(loadProductsLocal()); });
      }
      return Promise.resolve(loadProductsLocal());
    } catch (e) {
      return Promise.resolve(loadProductsLocal());
    }
  }
  function loadProductsLocal() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      var list = v ? JSON.parse(v) : [];
      list = Array.isArray(list) ? list : [];
      setProducts(list);
      return list;
    } catch (e) { return []; }
  }
  function saveProducts() {
    var list = getProducts();
    var p;
    try {
      if (storage && storage.set) p = storage.set(STORAGE_KEY, list);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
    try { if (typeof CC.onAffChange === 'function') CC.onAffChange(list); } catch (e) {}
    return p || Promise.resolve();
  }
  function nextId(list) {
    var max = -1;
    (list || []).forEach(function (p) { max = Math.max(max, num(p.id, -1)); });
    return max + 1;
  }
  function addProduct(p) {
    if (!p || !p.nama) return { error: 'Nama produk wajib diisi' };
    var list = getProducts();
    var rec = {
      id: p.id != null ? p.id : nextId(list),
      updatedAt: Date.now(),
      nama: String(p.nama || '').trim(),
      niche: String(p.niche || '').trim() || 'Umum',
      harga: num(p.harga),
      komisiPct: num(p.komisiPct),
      klik: num(p.klik),
      konversi: num(p.konversi),
      pendapatan: num(p.pendapatan),
      biaya: num(p.biaya),
      konten: String(p.konten || '').trim() || 'Review',
      platform: String(p.platform || '').trim() || '-',
      tanggal: String(p.tanggal || '').trim()
    };
    list.push(rec);
    setProducts(list);
    saveProducts();
    return { ok: true, product: rec, count: list.length };
  }
  function updateProduct(id, patch) {
    var list = getProducts();
    var idx = list.findIndex(function (p) { return num(p.id) === num(id); });
    if (idx < 0) return { error: 'Produk tidak ditemukan' };
    var merged = {};
    Object.keys(list[idx]).forEach(function (k) { merged[k] = list[idx][k]; });
    Object.keys(patch || {}).forEach(function (k) {
      if (k === 'nama') merged.nama = String(patch.nama || '').trim();
      else if (k === 'niche') merged.niche = String(patch.niche || '').trim();
      else if (k === 'konten') merged.konten = String(patch.konten || '').trim();
      else if (k === 'platform') merged.platform = String(patch.platform || '').trim();
      else if (k === 'tanggal') merged.tanggal = String(patch.tanggal || '').trim();
      else if (k === 'updatedAt') merged.updatedAt = num(patch.updatedAt, Date.now());
      else merged[k] = num(patch[k]);
    });
    merged.updatedAt = Date.now();
    list[idx] = merged;
    setProducts(list);
    saveProducts();
    return { ok: true, product: merged, count: list.length };
  }
  function deleteProduct(id) {
    var list = getProducts();
    var idx = list.findIndex(function (p) { return num(p.id) === num(id); });
    if (idx < 0) return { error: 'Produk tidak ditemukan' };
    var removed = list.splice(idx, 1)[0];
    setProducts(list);
    saveProducts();
    return { ok: true, removed: removed, count: list.length };
  }
  function clearProducts() {
    setProducts([]);
    saveProducts();
    return { ok: true, count: 0 };
  }

  // ---------- paket data contoh (demo) ----------
  function seedDemo() {
    var demo = [
      { nama: 'Kursus Trading Online', niche: 'Keuangan', harga: 1500000, komisiPct: 40, klik: 1200, konversi: 48, pendapatan: 28800000, biaya: 9000000, konten: 'Video', platform: 'TikTok', tanggal: '2026-01-05' },
      { nama: 'Suplemen Vitamin D', niche: 'Kesehatan', harga: 180000, komisiPct: 25, klik: 3400, konversi: 170, pendapatan: 7650000, biaya: 4200000, konten: 'Review', platform: 'YouTube', tanggal: '2026-01-12' },
      { nama: 'Sepatu Lari Premium', niche: 'Olahraga', harga: 900000, komisiPct: 15, klik: 2500, konversi: 62, pendapatan: 8375000, biaya: 5100000, konten: 'Review', platform: 'Instagram', tanggal: '2026-02-02' },
      { nama: 'Software CRM', niche: 'Bisnis', harga: 3500000, komisiPct: 30, klik: 600, konversi: 12, pendapatan: 12600000, biaya: 3500000, konten: 'Artikel', platform: 'Blog', tanggal: '2026-02-15' },
      { nama: 'Ebook Resep Sehat', niche: 'Kesehatan', harga: 75000, komisiPct: 60, klik: 4800, konversi: 340, pendapatan: 15300000, biaya: 2100000, konten: 'Email', platform: 'Newsletter', tanggal: '2026-03-03' },
      { nama: 'Skincare Facial Wash', niche: 'Kecantikan', harga: 220000, komisiPct: 35, klik: 1900, konversi: 44, pendapatan: 3388000, biaya: 2800000, konten: 'Video', platform: 'Instagram', tanggal: '2026-03-18' },
      { nama: 'Headphone Bluetooth', niche: 'Teknologi', harga: 850000, komisiPct: 18, klik: 2300, konversi: 30, pendapatan: 4590000, biaya: 4900000, konten: 'Review', platform: 'YouTube', tanggal: '2026-04-01' },
      { nama: 'Membership Gym', niche: 'Olahraga', harga: 1200000, komisiPct: 20, klik: 1500, konversi: 35, pendapatan: 8400000, biaya: 2700000, konten: 'Video', platform: 'TikTok', tanggal: '2026-04-20' },
      { nama: 'Kamera Webcam 1080p', niche: 'Teknologi', harga: 1200000, komisiPct: 15, klik: 1800, konversi: 28, pendapatan: 5040000, biaya: 3800000, konten: 'Artikel', platform: 'Blog', tanggal: '2026-05-06' },
      { nama: 'Teh Detox Herbal', niche: 'Kesehatan', harga: 130000, komisiPct: 30, klik: 2700, konversi: 78, pendapatan: 3042000, biaya: 1900000, konten: 'Email', platform: 'Newsletter', tanggal: '2026-05-22' }
    ];
    demo.forEach(function (d) { addProduct(d); });
    return getProducts();
  }

  // ---------- feature engineering (per produk, tanpa lookahead) ----------
  // Fitur = input yang DIKETAHUI sebelum/saat menentukan produk (harga, komisi,
  // klik, konversi, kategori). Kolom hasil (pendapatan/biaya/margin/roas/epc) TIDAK
  // dipakai sebagai fitur karena label profit = pendapatan - biaya: bila dimasukkan,
  // model tinggal merekonstruksi label (bocor/buntu, bukan belajar).
  function buildFeatures(list) {
    if (!Array.isArray(list) || list.length === 0) return { ok: false, error: 'Tidak ada data produk' };
    var names = ['harga', 'komisiPct', 'klik', 'konversi', 'convRate'];
    var tagsNiche = nicheIndex(list);
    var tagsKonten = kontenIndex(list);
    var tagsPlatform = platformIndex(list);
    var allCat = tagsNiche.concat(tagsKonten, tagsPlatform);
    for (var c = 0; c < allCat.length; c++) names.push('cat_' + allCat[c].toLowerCase().replace(/[^a-z0-9]/g, ''));

    var X = [];
    var labels = [];
    var rows = [];
    list.forEach(function (p) {
      var convRate = num(p.klik) > 0 ? num(p.konversi) / num(p.klik) : 0;
      var pendapatan = num(p.pendapatan);
      var biaya = num(p.biaya);
      var epc = num(p.klik) > 0 ? pendapatan / num(p.klik) : 0;
      var komisiAvail = num(p.harga) * (num(p.komisiPct) / 100);
      var margin = pendapatan > 0 ? (pendapatan - biaya) / pendapatan : (pendapatan - biaya > 0 ? 1 : -1);
      var roas = biaya > 0 ? pendapatan / biaya : (pendapatan > 0 ? 3 : 0);
      var catRow = {};
      allCat.forEach(function (cat) { catRow['cat_' + cat.toLowerCase().replace(/[^a-z0-9]/g, '')] = 0; });
      var key = function (s) { return 'cat_' + String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      catRow[key(p.niche)] = 1;
      catRow[key(p.konten)] = 1;
      catRow[key(p.platform)] = 1;
      var x = [num(p.harga), num(p.komisiPct), num(p.klik), num(p.konversi), convRate];
      names.slice(5).forEach(function (n) { x.push(catRow[n]); });
      var profit = pendapatan - biaya;
      var label = profit > 0 ? 1 : 0;
      X.push(x);
      labels.push(label);
      rows.push({ product: p, profit: profit, margin: margin, convRate: convRate, epc: epc, roas: roas, komisiAvail: komisiAvail, catRow: catRow });
    });
    return { ok: true, X: X, labels: labels, names: names, rows: rows, n: X.length };
  }

  function nicheIndex(list) {
    var set = {}, out = [];
    list.forEach(function (p) { var n = String(p.niche || 'Umum').trim(); if (n && !set[n]) { set[n] = 1; out.push(n); } });
    return out;
  }
  function kontenIndex(list) {
    var set = {}, out = [];
    list.forEach(function (p) { var n = String(p.konten || 'Review').trim(); if (n && !set[n]) { set[n] = 1; out.push(n); } });
    return out;
  }
  function platformIndex(list) {
    var set = {}, out = [];
    list.forEach(function (p) { var n = String(p.platform || '-').trim(); if (n && n !== '-' && !set[n]) { set[n] = 1; out.push(n); } });
    return out;
  }

  // ---------- split + scale ulang memakai ml.fitScaler (anti-lookahead) ----------
  function buildDatasets(list, opt) {
    opt = opt || {};
    var fe = buildFeatures(list);
    if (!fe.ok) return { error: fe.error };
    var n = fe.X.length;
    if (n < 5) return { error: 'Butuh minimal 5 produk untuk melatih model' };
    var trainFrac = opt.trainFrac || 0.7;
    var cut = Math.max(1, Math.floor(n * trainFrac));
    if (cut >= n) cut = n - 1;
    var trainRows = fe.X.slice(0, cut), trainY = fe.labels.slice(0, cut);
    var testRows = fe.X.slice(cut), testY = fe.labels.slice(cut);
    var scaler = ml.fitScaler ? ml.fitScaler(trainRows) : { mu: [], sd: [], ok: false };
    return {
      ok: true, fe: fe, X: fe.X, labels: fe.labels, names: fe.names, rows: fe.rows, n: n, cut: cut,
      trainX: ml.scaleAll ? ml.scaleAll(scaler, trainRows) : trainRows, trainY: trainY,
      testX: ml.scaleAll ? ml.scaleAll(scaler, testRows) : testRows, testY: testY,
      scaler: scaler
    };
  }

  // ---------- potong-fold + seed deterministik ----------
  function crossValidate(fe, opt) {
    opt = opt || {};
    var X = fe.X, Y = fe.labels, n = X.length;
    if (n < 5) return Promise.resolve({ error: 'Butuh minimal 5 produk untuk validasi' });
    var k = Math.max(2, Math.min(opt.k || 5, n));
    // indeks diacak dengan PRNG ber-seed (reproduksibel), lalu dipecah k-fold.
    var idx = [];
    for (var i = 0; i < n; i++) idx.push(i);
    var st = opt.seed == null ? 42 : opt.seed;
    function rnd() { st = (st * 1103515245 + 12345) % 2147483648; return st / 2147483648; }
    for (var j = n - 1; j > 0; j--) { var p = Math.floor(rnd() * (j + 1)); var t = idx[j]; idx[j] = idx[p]; idx[p] = t; }
    var folds = [], at = 0, baseSize = Math.floor(n / k), rem = n % k;
    for (var f = 0; f < k; f++) { var sz = baseSize + (f < rem ? 1 : 0); folds.push(idx.slice(at, at + sz)); at += sz; }
    var foldOpt = {};
    Object.keys(opt).forEach(function (kk) { if (kk !== 'onProgress') foldOpt[kk] = opt[kk]; });
    function trainCore(tX, tY, o) {
      if (typeof ml.trainMLPAsync === 'function') return ml.trainMLPAsync(tX, tY, o);
      return Promise.resolve(ml.trainMLP(tX, tY, o));
    }
    var accs = [], bases = [];
    var chain = Promise.resolve();
    folds.forEach(function (fold) {
      chain = chain.then(function () {
        var inFold = {}, trI = [];
        fold.forEach(function (ix) { inFold[ix] = 1; });
        for (var z = 0; z < n; z++) if (!inFold[z]) trI.push(z);
        var trX = trI.map(function (ix) { return X[ix]; }), trY = trI.map(function (ix) { return Y[ix]; });
        var teX = fold.map(function (ix) { return X[ix]; }), teY = fold.map(function (ix) { return Y[ix]; });
        var sc = ml.fitScaler ? ml.fitScaler(trX) : null;
        var trXs = sc ? ml.scaleAll(sc, trX) : trX;
        var teXs = sc ? ml.scaleAll(sc, teX) : teX;
        if (typeof ml.setSeed === 'function') ml.setSeed(opt.seed == null ? 42 : opt.seed);
        return trainCore(trXs, trY, foldOpt).then(function (model) {
          if (!ml.evalModel) { accs.push(0); bases.push(0); return; }
          var ev = ml.evalModel(teXs.map(function (r) { return model.predictProb(r); }), teY,
            trY.filter(function (y) { return y === 1; }).length / trY.length);
          accs.push(ev.acc); bases.push(ev.baseline);
        });
      });
    });
    return chain.then(function () {
      var avg = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
      var meanAcc = avg(accs), meanBase = avg(bases);
      return {
        ok: true, k: k,
        folds: accs.map(function (a, i) { return { fold: i + 1, acc: a, baseline: bases[i] }; }),
        acc: +meanAcc.toFixed(1), baseline: +meanBase.toFixed(1),
        edge: +((meanAcc - meanBase) / 100).toFixed(3)
      };
    }).catch(function (e) { return { error: 'K-fold gagal: ' + e.message }; });
  }

  // ---------- latih model profitabilitas ----------
  // Model A: p(produk menguntungkan) — MLP/logreg deterministik via CC.ml.
  // Validasi = k-fold CV (acak, seeded) pada data YANG SAMA; model final dilatih
  // di seluruh data. Laporan menyertakan akurasi rata2 CV + baseline + in-sample.
  function trainModel(list, opt) {
    opt = opt || {};
    var fe = buildFeatures(list);
    if (!fe.ok) return Promise.resolve({ error: fe.error });
    if (fe.X.length < 5) return Promise.resolve({ error: 'Butuh minimal 5 produk untuk melatih model' });
    if (typeof ml.setSeed === 'function' && opt.seed == null) opt.seed = 42;
    if (typeof ml.setSeed === 'function') ml.setSeed(opt.seed == null ? 42 : opt.seed);
    var scaler = ml.fitScaler ? ml.fitScaler(fe.X) : null;
    var Xs = scaler ? ml.scaleAll(scaler, fe.X) : fe.X;
    var Y = fe.labels;
    var trainOpt = {};
    Object.keys(opt).forEach(function (k) { trainOpt[k] = opt[k]; });
    function buildReport(model) {
      var inSample;
      try {
        inSample = ml.evalModel(Xs.map(function (r) { return model.predictProb(r); }), Y,
          Y.filter(function (y) { return y === 1; }).length / Y.length);
      } catch (e) {
        return Promise.resolve({ error: 'Evaluasi model gagal: ' + e.message });
      }
      return crossValidate(fe, opt).then(function (cv) {
        if (cv.error) return { error: cv.error };
        return {
          ok: true, engine: model.engine, kind: model.kind, model: model,
          train: inSample, cv: cv, scaler: scaler, names: fe.names, fe: fe,
          seed: opt.seed == null ? 42 : opt.seed
        };
      }).catch(function (e) { return { error: 'Validasi gagal: ' + e.message }; });
    }
    try {
      if (typeof ml.trainMLPAsync === 'function') {
        return ml.trainMLPAsync(Xs, Y, trainOpt, trainOpt.onProgress).then(buildReport).catch(function (e) {
          return { error: 'Pelatihan gagal: ' + e.message };
        });
      }
      return Promise.resolve(buildReport(ml.trainMLP(Xs, Y, trainOpt)));
    } catch (e) {
      return Promise.resolve({ error: 'Pelatihan gagal: ' + e.message });
    }
  }

  // ---------- skor profitabilitas tiap produk ----------
  function scoreProducts(list, opt) {
    opt = opt || {};
    return trainModel(list, opt).then(function (m) {
      if (m.error) return m;
      var fe = m.fe || (m.ds && m.ds.fe);
      if (!fe) return { error: 'Data fitur tidak tersedia' };
      var scored = [];
      fe.X.forEach(function (xrow, i) {
        var p = 0.5;
        try { p = m.model.predictProb(ml.scaleRow(m.scaler, xrow)); } catch (e) {}
        var row = fe.rows[i];
        scored.push({
          product: row.product,
          pProfit: +Math.max(0, Math.min(1, p)).toFixed(3),
          profitLabel: row.profit,
          margin: row.margin,
          convRate: row.convRate,
          epc: row.epc,
          roas: row.roas,
          verdict: p >= 0.66 ? 'GENJOT' : p >= 0.5 ? 'PERTAHANKAN' : 'EVALUASI'
        });
      });
      scored.sort(function (a, b) { return b.pProfit - a.pProfit; });
      return { ok: true, report: m, scored: scored };
    });
  }

  // ---------- analisis deskriptif ----------
  function analyze(list) {
    if (!list || !list.length) return { error: 'Belum ada data — tambahkan produk dulu (/tambah)' };
    var totalPendapatan = 0, totalBiaya = 0, totalKlik = 0, totalKonversi = 0, n = list.length;
    var perNiche = {}, perPlatform = {}, perKonten = {};
    var profitable = 0;
    list.forEach(function (p) {
      var pend = num(p.pendapatan), biaya = num(p.biaya);
      totalPendapatan += pend; totalBiaya += biaya; totalKlik += num(p.klik); totalKonversi += num(p.konversi);
      if (pend - biaya > 0) profitable++;
      var key = function (map, k) { map[k] = map[k] || { n: 0, pendapatan: 0, biaya: 0, konversi: 0, klik: 0 }; map[k].n++; map[k].pendapatan += pend; map[k].biaya += biaya; map[k].konversi += num(p.konversi); map[k].klik += num(p.klik); };
      key(perNiche, p.niche || 'Umum');
      key(perPlatform, p.platform || '-');
      key(perKonten, p.konten || 'Review');
    });
    var convRate = totalKlik > 0 ? totalKonversi / totalKlik : 0;
    var margin = totalPendapatan > 0 ? (totalPendapatan - totalBiaya) / totalPendapatan : 0;
    function best(map, scoreFn) {
      var keys = Object.keys(map);
      if (!keys.length) return null;
      var b = keys[0];
      for (var i = 1; i < keys.length; i++) if (scoreFn(map[keys[i]]) > scoreFn(map[b])) b = keys[i];
      return { key: b, val: map[b], score: scoreFn(map[b]) };
    }
    return {
      ok: true, n: n,
      totalPendapatan: totalPendapatan, totalBiaya: totalBiaya,
      laba: totalPendapatan - totalBiaya,
      margin: margin, convRate: convRate, totalKlik: totalKlik, totalKonversi: totalKonversi,
      profitableCount: profitable,
      perNiche: perNiche, perPlatform: perPlatform, perKonten: perKonten,
      bestNiche: best(perNiche, function (m) { return m.pendapatan - m.biaya; }),
      bestPlatform: best(perPlatform, function (m) { return m.pendapatan - m.biaya; }),
      bestKonten: best(perKonten, function (m) { return m.pendapatan - m.biaya; })
    };
  }

  // ---------- optimasi ----------
  function optimize(list) {
    var a = analyze(list);
    if (a.error) return a;
    var items = list.map(function (p) {
      var laba = num(p.pendapatan) - num(p.biaya);
      var convRate = num(p.klik) > 0 ? num(p.konversi) / num(p.klik) : 0;
      return { product: p, laba: laba, convRate: convRate, roas: num(p.biaya) > 0 ? num(p.pendapatan) / num(p.biaya) : (num(p.pendapatan) > 0 ? 999 : 0) };
    }).sort(function (x, y) { return y.laba - x.laba; });
    var genjot = items.filter(function (i) { return i.laba > 0; }).slice(0, 3);
    var henti = items.filter(function (i) { return i.laba <= 0; }).sort(function (x, y) { return x.laba - y.laba; }).slice(0, 3);
    return {
      ok: true, a: a, ranking: items,
      genjot: genjot.map(function (i) { return i.product.nama; }),
      henti: henti.map(function (i) { return i.product.nama; }),
      saran: buildSuggestions(a)
    };
  }

  function buildSuggestions(a) {
    var out = [];
    if (a.bestKonten) out.push('Konten **' + a.bestKonten.key + '** paling menghasilkan (laba ' + fmtRupiah(a.bestKonten.score) + ') — perbanyak format ini.');
    if (a.bestPlatform) out.push('Platform **' + a.bestPlatform.key + '** dominan (laba ' + fmtRupiah(a.bestPlatform.score) + ') — alokasikan lebih banyak anggaran ke sini.');
    if (a.bestNiche) out.push('Niche **' + a.bestNiche.key + '** paling untung — jadikan fokus konten utama.');
    if (a.margin < 0.1) out.push('Margin tipis (' + (a.margin * 100).toFixed(0) + '%) — naikkan harga, negosiasi komisi, atau tekan biaya iklan.');
    return out;
  }

  // ---------- forecast pendapatan (deret waktu sederhana + ML) ----------
  function forecast(list, opt) {
    opt = opt || {};
    var rows = (list || []).slice().sort(function (a, b) { return String(a.tanggal).localeCompare(String(b.tanggal)); });
    if (!rows.length) return Promise.resolve({ error: 'Belum ada data' });
    var period = opt.period || 'bulanan';
    var buckets = {};
    rows.forEach(function (p) {
      var key = bucketKey(p.tanggal, period);
      if (!key) return;
      buckets[key] = buckets[key] || { pendapatan: 0, biaya: 0, klik: 0, konversi: 0 };
      buckets[key].pendapatan += num(p.pendapatan);
      buckets[key].biaya += num(p.biaya);
      buckets[key].klik += num(p.klik);
      buckets[key].konversi += num(p.konversi);
    });
    var keys = Object.keys(buckets).sort();
    if (!keys.length) return Promise.resolve({ error: 'Tidak ada data bertanggal' });
    if (keys.length < 2) return Promise.resolve({ error: 'Butuh minimal 2 periode untuk forecasting' });
    var series = keys.map(function (k) { return buckets[k]; });

    // regresi linear sederhana sebagai model tren (anti-overfit pada data sedikit)
    function trendRegress(vals) {
      var n = vals.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (var i = 0; i < n; i++) { sx += i; sy += vals[i]; sxx += i * i; sxy += i * vals[i]; }
      var denom = n * sxx - sx * sx;
      var m = denom ? (n * sxy - sx * sy) / denom : 0;
      var b = (sy - m * sx) / n;
      return { m: m, b: b };
    }
    var pend = series.map(function (s) { return s.pendapatan; });
    var t = trendRegress(pend);
    // Gunakan kemiringan dari 3 periode terakhir (lebih relevan utk tren terkini),
    // dan reversion menuju nilai terakhir bila tren lemah (R² kecil) agar tidak overproject.
    var win = pend.slice(Math.max(0, pend.length - 3));
    var tWin = trendRegress(win);
    var nextIdx = series.length;
    var linearNext = Math.max(0, tWin.m * nextIdx + tWin.b);
    var lastTotal = pend[pend.length - 1];
    var forecastPend;
    if (tWin.m <= 0) {
      forecastPend = Math.max(0, lastTotal + tWin.m);
    } else {
      forecastPend = Math.max(lastTotal, linearNext);
    }
    var growth = lastTotal > 0 ? (forecastPend - lastTotal) / lastTotal : 0;
    var r2Series = series.map(function (s) { return s.pendapatan; });
    var mu = r2Series.reduce(function (s, v) { return s + v; }, 0) / r2Series.length;
    var sse = 0, sst = 0;
    for (var i2 = 0; i2 < r2Series.length; i2++) {
      var fit = t.m * i2 + t.b;
      sse += (r2Series[i2] - fit) * (r2Series[i2] - fit);
      sst += (r2Series[i2] - mu) * (r2Series[i2] - mu);
    }
    var r2 = sst > 0 ? 1 - sse / sst : 0;
    return Promise.resolve({
      ok: true, period: period, buckets: keys.map(function (k, i) {
        return { key: k, pendapatan: series[i].pendapatan, biaya: series[i].biaya, klik: series[i].klik, konversi: series[i].konversi };
      }),
      trend: { m: t.m, r2: +r2.toFixed(3) },
      forecast: { key: 'Berikutnya', pendapatan: +forecastPend.toFixed(0) },
      growthPct: +((growth) * 100).toFixed(1),
      lastTotal: lastTotal
    });
  }
  function bucketKey(tanggal, period) {
    if (!tanggal) return null;
    var m = String(tanggal).match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    if (period === 'harian') return String(tanggal).slice(0, 10);
    if (period === 'tahunan') return m[1];
    return m[1] + '-' + m[2];
  }

  // ---------- strategi ----------
  function strategy(list) {
    var a = analyze(list);
    if (a.error) return a;
    var o = optimize(list);
    var steps = [];
    steps.push('**Fokus pada sumber keuntungan terbesar:** ' + (o.genjot.length ? o.genjot.map(function (n) { return '`' + n + '`'; }).join(', ') : 'semua produk belum menguntungkan') + '.');
    steps.push('**Gandakan format konten yang terbukti** (' + (a.bestKonten ? a.bestKonten.key : '-') + ') dan platform paling efektif (' + (a.bestPlatform ? a.bestPlatform.key : '-') + ').');
    steps.push('**Optimasi konversi:** tawarkan bonus eksklusif, bukti sosial, dan CTA jelas. Target konversi sehat ≥ 2%.');
    if (o.henti && o.henti.length) steps.push('**Hentikan/potong anggaran untuk:** ' + o.henti.map(function (n) { return '`' + n + '`'; }).join(', ') + ' (laba ≤ 0).');
    steps.push('**Skala dengan data:** tambah produk baru yang serupa dengan pemenang, dan gunakan `/forecast` untuk proyeksi pendapatan berikutnya.');
    return { ok: true, a: a, steps: steps };
  }

  // ---------- format (Bahasa Indonesia) ----------
  function fmtRupiah(v) {
    return 'Rp' + Math.round(num(v)).toLocaleString('id-ID');
  }
  function fmtPct(v) {
    return (num(v) * 100).toFixed(1) + '%';
  }
  function fmtNum(v) {
    return Math.round(num(v)).toLocaleString('id-ID');
  }

  function formatProducts(list) {
    if (!list || !list.length) return 'Belum ada produk. Gunakan `/tambah` (form) atau `/demo` untuk data contoh.';
    var rows = list.map(function (p) {
      var laba = num(p.pendapatan) - num(p.biaya);
      return '| ' + p.nama + ' | ' + (p.niche || '-') + ' | ' + fmtRupiah(p.harga) + ' | ' + num(p.komisiPct) + '% | ' + fmtNum(p.klik) + ' | ' + fmtNum(p.konversi) + ' | ' + fmtRupiah(p.pendapatan) + ' | ' + fmtRupiah(laba) + ' | ' + (p.platform || '-') + ' |';
    }).join('\n');
    return '## 📦 Data Produk Affiliator (' + list.length + ')\n\n' +
      '| Produk | Niche | Harga | Komisi | Klik | Konversi | Pendapatan | Laba | Platform |\n|---|---|---|---:|---:|---:|---:|---:|---|---|\n' + rows;
  }

  function formatAnalysis(a) {
    if (!a || a.error) return '⚠️ ' + (a && a.error);
    return '## 📊 Analisis Penjualan Affiliator\n\n' +
      '**Total pendapatan:** ' + fmtRupiah(a.totalPendapatan) + '\n' +
      '**Total biaya:** ' + fmtRupiah(a.totalBiaya) + '\n' +
      '**Laba bersih:** ' + fmtRupiah(a.laba) + ' (_margin ' + fmtPct(a.margin) + '_)\n' +
      '**Klik:** ' + fmtNum(a.totalKlik) + ' · **Konversi:** ' + fmtNum(a.totalKonversi) + ' · **Conv. rate:** ' + fmtPct(a.convRate) + '\n' +
      '**Produk menguntungkan:** ' + a.profitableCount + '/' + a.n + '\n\n' +
      '### 🤖 Terbaik per kategori\n' +
      '- **Niche:** ' + (a.bestNiche ? a.bestNiche.key + ' (laba ' + fmtRupiah(a.bestNiche.score) + ')' : '-') + '\n' +
      '- **Platform:** ' + (a.bestPlatform ? a.bestPlatform.key + ' (laba ' + fmtRupiah(a.bestPlatform.score) + ')' : '-') + '\n' +
      '- **Konten:** ' + (a.bestKonten ? a.bestKonten.key + ' (laba ' + fmtRupiah(a.bestKonten.score) + ')' : '-');
  }

  function formatOptimize(o) {
    if (!o || o.error) return '⚠️ ' + (o && o.error);
    var out = '## 🎯 Optimasi & Rekomendasi\n\n';
    out += '### 🚀 Produk untuk DIGENJOT (laba tertinggi)\n';
    if (o.ranking.length) {
      out += o.ranking.slice(0, 5).map(function (i) {
        return '- **' + i.product.nama + '** — laba ' + fmtRupiah(i.laba) + ' · conv ' + fmtPct(i.convRate) + ' · ROAS ' + (i.roas === 999 ? '∞' : i.roas.toFixed(1)) + 'x';
      }).join('\n');
    }
    out += '\n\n### ⛔ Produk untuk DIEVALUASI (laba ≤ 0)\n';
    if (o.henti && o.henti.length) {
      out += o.henti.map(function (n) { return '- **' + n + '**'; }).join('\n');
    } else {
      out += '- Tidak ada — semua produk positif.';
    }
    out += '\n\n### 💡 Saran\n';
    if (o.saran && o.saran.length) out += o.saran.map(function (s) { return '- ' + s; }).join('\n');
    return out;
  }

  function formatScores(s) {
    if (!s || s.error) return '⚠️ ML gagal: ' + (s && s.error);
    var cv = s.report.cv || {};
    var val = '_Validasi: CV ' + (cv.k || '–') + '-fold, akurasi rata-rata ' + cv.acc + '% · baseline ' + cv.baseline + '% (' + (cv.edge >= 0 ? '+' : '') + (cv.edge * 100).toFixed(1) + ' poin). In-sample ' + s.report.train.acc + '%._';
    if (cv.folds && cv.folds.length) val += ' Per-fold: ' + cv.folds.map(function (g) { return g.acc + '%'; }).join('/') + '.';
    if (cv.baseline && cv.edge < 0.005) val += ' ⚠️ Model belum lebih baik dari menebak mayoritas — tambah data untuk hasil yang lebih meyakinkan.';
    var rows = s.scored.map(function (r) {
      return '| ' + r.product.nama + ' | ' + (r.pProfit * 100).toFixed(0) + '% | **' + r.verdict + '** | ' + fmtRupiah(r.product.pendapatan - r.product.biaya) + ' |';
    }).join('\n');
    return '## 🧠 Skor Profitabilitas ML (' + s.report.kind + ' · ' + s.report.engine + ')\n\n' + val + '\n\n' +
      '| Produk | P(untung) | Aksi | Laba |\n|---|---|---|---:|\n' + rows;
  }

  function formatForecast(f) {
    if (!f || f.error) return '⚠️ ' + (f && f.error);
    var rows = f.buckets.map(function (b) {
      return '| ' + b.key + ' | ' + fmtRupiah(b.pendapatan) + ' | ' + fmtRupiah(b.biaya) + ' | ' + fmtNum(b.klik) + ' | ' + fmtNum(b.konversi) + ' |';
    }).join('\n');
    return '## 🔮 Forecast Pendapatan (per ' + f.period + ')\n\n' +
      '| Periode | Pendapatan | Biaya | Klik | Konversi |\n|---|---:|---:|---:|---:|\n' + rows +
      '\n\n**Proyeksi periode berikutnya:** ' + fmtRupiah(f.forecast.pendapatan) +
      ' (_tren ' + (f.growthPct >= 0 ? '+' : '') + f.growthPct + '%, fit R²=' + f.trend.r2 + '_)';
  }

  function formatStrategy(s) {
    if (!s || s.error) return '⚠️ ' + (s && s.error);
    return '## 🗺️ Strategi Affiliator\n\n' +
      s.steps.map(function (st, i) { return (i + 1) + '. ' + st; }).join('\n');
  }

  // ---------- API publik ----------
  CC.aff = {
    getProducts: getProducts,
    setProducts: setProducts,
    loadProducts: loadProducts,
    saveProducts: saveProducts,
    addProduct: addProduct,
    updateProduct: updateProduct,
    deleteProduct: deleteProduct,
    clearProducts: clearProducts,
    seedDemo: seedDemo,
    buildFeatures: buildFeatures,
    buildDatasets: buildDatasets,
    trainModel: trainModel,
    scoreProducts: scoreProducts,
    analyze: analyze,
    optimize: optimize,
    forecast: forecast,
    strategy: strategy,
    formatProducts: formatProducts,
    formatAnalysis: formatAnalysis,
    formatOptimize: formatOptimize,
    formatScores: formatScores,
    formatForecast: formatForecast,
    formatStrategy: formatStrategy
  };
})();