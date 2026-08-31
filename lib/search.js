/* lib/search.js — Web search (DuckDuckGo + Wikipedia) for cangcilung.
   Sumber tunggal pencarian web. Dipakai app.js via window.CC.search.searchWeb. */
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});

  var WEB_RE = /\b(terkini|terbaru|berita|sekarang|hari ini|tahun \d{4}|cuaca|hasil pertandingan|skor|harga|kurs|jadwal|pemenang|presiden|gubernur|pemilu|kecelakaan|gempa|bencana|ramalan|prediksi|update|berapa harga|harga saham|film terbaru|lagu terbaru|peringkat|trending|viral|angka kematian|kasus|penduduk|populasi|latest|current|today|weather|score|price|news|who (is|won|is the)|what (is|are) the|how many|population|earthquake|election|forecast|stock|market|rank|popular|trending|breaking)\b/i;

  var TRUSTED = ['wikipedia.org', 'kompas.com', 'detik.com', 'tempo.co', 'bbc.com', 'reuters.com', 'cnn.com', 'techcrunch.com', 'github.com', 'stackoverflow.com', 'mdn.mozilla.org', 'developer.mozilla.org', 'arxiv.org', 'docs.python.org'];
  var LOW_TRUST = ['quora.com', 'reddit.com', 'brainly.co.id', 'colearn.id'];

  function credTag(url) {
    if (!url) return '';
    var u = url.toLowerCase();
    if (TRUSTED.some(function (d) { return u.indexOf(d) !== -1; })) return ' [✓ terverifikasi]';
    if (LOW_TRUST.some(function (d) { return u.indexOf(d) !== -1; })) return ' [⚠ perlu verifikasi]';
    return '';
  }

  function needsWeb(text) {
    return WEB_RE.test(text);
  }

  /* Ambil DDG "lite" via proxy lokal Vercel (/api/quote) lalu fallback ke proxy pihak ketiga. */
  function fetchDdg(q) {
    var target = 'https://lite.duckduckgo.com/lite/?q=' + q + '&kl=id-id';
    var proxies = [];
    var origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    if (origin) proxies.push(origin + '/api/quote?url=');
    proxies.push('https://api.allorigins.win/raw?url=');
    proxies.push('https://corsproxy.io/?url=');

    var idx = 0;
    function attempt() {
      if (idx >= proxies.length) return Promise.resolve('');
      var url = proxies[idx++] + encodeURIComponent(target);
      return fetch(url, { signal: AbortSignal.timeout(12000) })
        .then(function (res) { return res.ok ? res.text() : ''; })
        .catch(function () { return ''; })
        .then(function (html) {
          if (!html || html.length < 200) return attempt();
          return html;
        });
    }
    return attempt();
  }

  function parseDdg(html) {
    var tmp;
    try {
      tmp = new DOMParser().parseFromString(html, 'text/html');
    } catch (e) {
      tmp = document.createElement('div');
      tmp.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
    }
    var results = [], titles = [], urls = [];
    tmp.querySelectorAll('.result-snippet').forEach(function (el, i) { if (i < 5) results.push(el.textContent.trim()); });
    tmp.querySelectorAll('.result-title').forEach(function (el, i) { if (i < 5) titles.push(el.textContent.trim()); });
    tmp.querySelectorAll('.result__title').forEach(function (el, i) { if (i < 5) titles.push(el.textContent.trim()); });
    tmp.querySelectorAll('.result__url').forEach(function (el, i) { if (i < 5) urls.push(el.textContent.trim()); });
    if (!results.length) tmp.querySelectorAll('td').forEach(function (el, i) { if (i < 5 && el.textContent.trim().length > 20) results.push(el.textContent.trim()); });
    var out = [];
    results.forEach(function (r, i) {
      var prefix = titles[i] ? '### ' + titles[i] + '\n' : '';
      out.push(prefix + r + credTag(urls[i] || titles[i]));
    });
    return out.length ? out.join('\n\n').slice(0, 4000) : '';
  }

  function searchWebWikipedia(query) {
    var q = encodeURIComponent(query.replace(/[?""''!]/g, ' ').slice(0, 200));
    var url = 'https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + q + '&format=json&origin=*&srlimit=3';
    var hits = [];
    var usedId = true;
    return fetch(url, { signal: AbortSignal.timeout(10000) })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)); })
      .then(function (j) {
        hits = (j.query && j.query.search) || [];
        if (!hits.length) {
          usedId = false;
          return fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + q + '&format=json&origin=*&srlimit=2', { signal: AbortSignal.timeout(10000) })
            .then(function (r) { return r.ok ? r.json() : { query: { search: [] } }; })
            .then(function (j2) { hits = (j2.query && j2.query.search) || []; });
        }
      })
      .then(function () {
        var titles = hits.map(function (h) { return h.title; }).slice(0, 3);
        var chain = Promise.resolve();
        var out = [];
        titles.forEach(function (title) {
          chain = chain.then(function () {
            var base = usedId ? 'id' : 'en';
            return fetch('https://' + base + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title), { signal: AbortSignal.timeout(10000) })
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (s) { if (s && s.extract) out.push('## ' + s.title + '\n' + s.extract.slice(0, 1200)); })
              .catch(function () {});
          });
        });
        return chain.then(function () { return out.join('\n\n').slice(0, 6000); });
      });
  }

  function searchWeb(query) {
    var rawQuery = query.replace(/[?""''!]/g, ' ').replace(/\b(tolong|jelaskan|apa itu|bagaimana|cara|kenapa|apakah|berapa|mengapa|siapa|dimana|kapan|yang|dengan|untuk|dalam|dan|di|ke|dari|adalah|itu|ini)\b/gi, '').replace(/\s+/g, ' ').trim().slice(0, 200);
    var q = encodeURIComponent(rawQuery || query.replace(/[?""''!]/g, ' ').slice(0, 200));
    var ddgPromise = fetchDdg(q).then(parseDdg);
    var iaPromise = fetch('https://api.duckduckgo.com/?q=' + q + '&format=json&no_html=1&skip_disambig=1&t=cangcilung', { signal: AbortSignal.timeout(10000) })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (j) {
        if (!j) return '';
        var out = '';
        if (j.AbstractText) out += j.AbstractText.slice(0, 1200);
        if (j.Answer) out += (out ? '\n' : '') + j.Answer.slice(0, 800);
        if (j.RelatedTopics && j.RelatedTopics.length) {
          j.RelatedTopics.slice(0, 3).forEach(function (t) {
            if (t && t.Text) out += (out ? '\n' : '') + '- ' + t.Text.slice(0, 300);
          });
        }
        return out;
      })
      .catch(function () { return ''; });
    var wikiPromise = searchWebWikipedia(query).catch(function () { return ''; });
    return Promise.all([ddgPromise, iaPromise, wikiPromise]).then(function (parts) {
      var ddg = parts[0] || '';
      var ia = parts[1] || '';
      var wiki = parts[2] || '';
      if (!ddg && !ia && !wiki) return '';
      var out = [];
      if (ddg) out.push('[Informasi dari DuckDuckGo]\n' + ddg);
      if (ia) out.push('[Jawaban cepat DuckDuckGo]\n' + ia);
      if (wiki) out.push('[Referensi dari Wikipedia — sumber terverifikasi]\n' + wiki);
      return out.join('\n\n').slice(0, 8000);
    });
  }

  CC.search = {
    WEB_RE: WEB_RE,
    needsWeb: needsWeb,
    searchWeb: searchWeb,
    searchWebWikipedia: searchWebWikipedia
  };
})();
