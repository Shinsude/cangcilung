/* cangcilung — Katalog Skill & Bundel (pola MANTRA).
   Ekstraksi dari app.js: data skill/bundel + rekomendasi murni. */
window.cangcilungMantra = window.cangcilungMantra || {};

window.cangcilungMantra.SKILLS = {
  ta:        { cmd: '/ta SYM',                    desc: 'analisis lengkap semua indikator + SMC + verdict',          tags: ['analisa', 'prediksi', 'analisis'] },
  chart:     { cmd: '/chart SYM TF',              desc: 'tampilkan chart (5m/15m/30m/1h/1d/1w)',                   tags: ['grafik', 'chart', 'candle'] },
  rsi:       { cmd: '/rsi SYM N',                 desc: 'RSI + MACD + Bollinger',                                  tags: ['rsi', 'macd', 'indikator', 'momentum'] },
  structure: { cmd: '/structure SYM',             desc: 'market structure (HH/HL/LH/LL)',                          tags: ['struktur', 'support', 'resistance', 'smc'] },
  session:   { cmd: '/session',                   desc: 'sesi market aktif & jadwal',                              tags: ['sesi', 'session', 'jadwal'] },
  profile:   { cmd: '/profile SYM TF',            desc: 'volume profile (POC/HVN/LVN)',                             tags: ['profile', 'volume', 'poc'] },
  risk:      { cmd: '/risk SYM ACC PCT',          desc: 'risk management (SL/TP/lot)',                              tags: ['risk', 'risiko', 'modal', 'manajemen'] },
  corr:      { cmd: '/corr SYM',                  desc: 'korelasi XAU vs DXY (atau NDX vs VIX)',                    tags: ['korelasi', 'correlation', 'dxy'] },
  backtest:  { cmd: '/backtest SYM STRAT PARAMS', desc: 'uji strategi (rsi/macd/bb/sma/all)',                      tags: ['backtest', 'strategi', 'uji'] },
  rekomendasi: { cmd: '/rekomendasi SYM',          desc: 'arah (BUY/SELL/WATCH) + entry/SL/TP/RR',                 tags: ['rekomendasi', 'signal', 'rec', 'rekom', 'arah', 'beli jual'] },
  news:      { cmd: '/news SYM | /berita SYM',     desc: 'sentimen berita terbaru',                                 tags: ['news', 'berita', 'sentimen'] },
  alert:     { cmd: '/alert SYM TARGET',          desc: 'pasang alert harga',                                      tags: ['alert', 'notifikasi', 'sinyal'] },
  alerts:    { cmd: '/alerts',                    desc: 'lihat alert aktif (hapus: /alert-del ID)',                tags: ['alerts', 'daftar alert'] }
};

window.cangcilungMantra.BUNDLES = {
  analisa:   { skills: ['ta', 'structure', 'risk'],        desc: 'analisis market lengkap: tren → struktur → risiko' },
  risiko:    { skills: ['risk', 'corr', 'alerts'],         desc: 'manajemen risiko menyeluruh: posisi → korelasi → alert' },
  teknikal:  { skills: ['rsi', 'chart', 'profile'],        desc: 'kajian indikator teknis + konfirmasi chart' },
  berita:    { skills: ['news', 'ta'],                     desc: 'sentimen berita lalu konfirmasi bias harga' },
  sinyal:    { skills: ['backtest', 'alert'],              desc: 'uji strategi lalu pasang alert sinyal' }
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
