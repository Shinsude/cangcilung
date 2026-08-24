/* lib/search.js — Web search (DuckDuckGo + Wikipedia) for cangcilung */
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});

  var WEB_RE = /\b(terkini|terbaru|berita|sekarang|hari ini|tahun \d{4}|cuaca|hasil pertandingan|skor|harga|kurs|jadwal|pemenang|presiden|gubernur|pemilu|kecelakaan|gempa|bencana|ramalan|prediksi|update|berapa harga|harga saham|film terbaru|lagu terbaru|peringkat|trending|viral|angka kematian|kasus|penduduk|populasi|latest|current|today|weather|score|price|news|who (is|won|is the)|what (is|are) the|how many|population|earthquake|election|forecast|stock|market|rank|popular|trending|breaking)\b/i;

  function needsWeb(text) {
    return WEB_RE.test(text);
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
    var q = query.replace(/[?""''!]/g, ' ').replace(/\b(tolong|jelaskan|apa itu|bagaimana|cara|kenapa|apakah|berapa)\b/gi, '').replace(/\s+/g, ' ').trim().slice(0, 200);
    var encodedQ = encodeURIComponent(q);
    var ddgUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://lite.duckduckgo.com/lite/?q=' + encodedQ + '&kl=id-id');
    var ddgPromise = fetch(ddgUrl, { signal: AbortSignal.timeout(12000) })
      .then(function (res) { return res.ok ? res.text() : ''; })
      .then(function (html) {
        if (!html || html.length < 200) return '';
        var tmp = document.createElement('div');
        tmp.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
        var results = [];
        var titles = [];
        tmp.querySelectorAll('.result-snippet').forEach(function (el, i) { if (i < 5) results.push(el.textContent.trim()); });
        tmp.querySelectorAll('.result__title').forEach(function (el, i) { if (i < 5) titles.push(el.textContent.trim()); });
        if (!results.length) tmp.querySelectorAll('td').forEach(function (el, i) { if (i < 5 && el.textContent.trim().length > 20) results.push(el.textContent.trim()); });
        var out = [];
        results.forEach(function (r, i) {
          var prefix = titles[i] ? '### ' + titles[i] + '\n' : '';
          out.push(prefix + r);
        });
        return out.length ? out.join('\n\n').slice(0, 4000) : '';
      })
      .catch(function () { return ''; });
    var wikiPromise = searchWebWikipedia(query).catch(function () { return ''; });
    return Promise.all([ddgPromise, wikiPromise]).then(function (parts) {
      var ddg = parts[0] || '';
      var wiki = parts[1] || '';
      if (!ddg && !wiki) return '';
      var out = [];
      if (ddg) out.push('[Informasi dari DuckDuckGo]\n' + ddg);
      if (wiki) out.push('[Referensi dari Wikipedia]\n' + wiki);
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
