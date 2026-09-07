/* cangcilung — Katalog Skill & Bundel (pola MANTRA).
   Ekstraksi dari app.js: data skill/bundel + rekomendasi murni.
   CangCilung Affiliate: skill & bundel fokus affiliasi penjualan. */
window.cangcilungMantra = window.cangcilungMantra || {};

window.cangcilungMantra.SKILLS = {
  tambah:    { cmd: '/tambah',                    desc: 'buka form / tambah produk affiliasi',                      tags: ['tambah', 'produk', 'input', 'form'] },
  list:      { cmd: '/daftar',                    desc: 'tabel semua produk & laba',                                tags: ['daftar', 'list', 'produk', 'data'] },
  hapus:     { cmd: '/hapus NAMA|ID',             desc: 'hapus satu produk',                                        tags: ['hapus', 'delete', 'buang'] },
  edit:      { cmd: '/edit NAMA|ID',              desc: 'ubah data produk (buka form terisi)',                  tags: ['edit', 'ubah', 'update', 'perbaiki'] },
  beres:     { cmd: '/beres',                     desc: 'bersihkan semua produk',                                   tags: ['beres', 'clear', 'reset', 'kosong'] },
  demo:      { cmd: '/demo',                      desc: 'muat 10 produk contoh',                                    tags: ['demo', 'contoh', 'sample', 'sampel'] },
  analisis:  { cmd: '/analisis',                  desc: 'pendapatan, biaya, laba, margin, konversi + terbaik per niche/platform/konten', tags: ['analisa', 'analisis', 'laba', 'penjualan', 'pendapatan', 'konversi', 'niche', 'platform', 'ringkasan'] },
  optimasi:  { cmd: '/optimasi',                  desc: 'produk DIGENJOT vs DIEVALUASI + saran',                     tags: ['optimasi', 'optimize', 'genjot', 'saran', 'rekomendasi', 'tingkatkan'] },
  prediksi:  { cmd: '/prediksi',                  desc: 'latih model ML di browser — skor p(untung) tiap produk + validasi OOS', tags: ['prediksi', 'skor', 'ml', 'model', 'machine learning', 'deep learning', 'ai', 'kecerdasan buatan', 'probabilitas'] },
  forecast:  { cmd: '/forecast',                  desc: 'proyeksi pendapatan periode berikutnya (bulanan/harian/tahunan)', tags: ['forecast', 'proyeksi', 'prediksi pendapatan', 'ramal', 'tren'] },
  strategi:  { cmd: '/strategi',                  desc: 'langkah konkret menaikkan komisi',                          tags: ['strategi', 'strategy', 'komisi', 'skala', 'roadmap', 'rencana'] },
  export:    { cmd: '/export',                    desc: 'unduh cadangan data produk (file JSON)',                    tags: ['export', 'cadangan', 'backup', 'unduh', 'download', 'simpan'] },
  import:    { cmd: '/import',                    desc: 'muat kembali file cadangan (JSON)',                        tags: ['import', 'restore', 'pulihkan', 'kembalikan', 'muat'] }
};

window.cangcilungMantra.BUNDLES = {
  analisa:  { skills: ['analisis', 'optimasi', 'strategi'], desc: 'kajian penuh: ringkasan laba → produk terbaik → strategi' },
  evaluasi: { skills: ['analisis', 'optimasi'],             desc: 'ukur performa lalu cari peluang optimasi' },
  prediksi: { skills: ['prediksi', 'forecast', 'strategi'], desc: 'skor ML tiap produk → proyeksi pendapatan → langkah skala' },
  konten:   { skills: ['analisis', 'optimasi'],             desc: 'temukan format konten & platform paling menguntungkan' }
};

window.cangcilungMantra._bundleNameMatch = function (bundleName, t) {
  return t.indexOf(bundleName.toLowerCase()) !== -1;
};

window.cangcilungMantra.bundleRecommend = function (text, SKILLS, BUNDLES) {
  var t = (text || '').toLowerCase();
  var matches = [];
  var names = Object.keys(BUNDLES);
  names.forEach(function (bn) { matches.push([bn, 0]); });
  names.forEach(function (bn) {
    var score = 0;
    BUNDLES[bn].skills.forEach(function (s) {
      var tags = SKILLS[s] ? SKILLS[s].tags : [];
      tags.forEach(function (tg) { if (t.indexOf(tg) !== -1) score++; });
    });
    if (window.cangcilungMantra._bundleNameMatch(bn, t)) score += 2;
    matches[names.indexOf(bn)][1] = score;
  });
  matches.sort(function (a, b) { return b[1] - a[1]; });
  if (matches[0] && matches[0][1] >= 1) return matches[0][0];
  return null;
};
