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

  /* ---------- Harga saham / indeks / kripto real-time (Yahoo Finance, gratis, tanpa key) ---------- */
  var TICKER_HINTS = {
    'usa100': '^NDX', 'nasdaq100': '^NDX', 'nasdaq': '^IXIC', 'xauusd': 'GC=F',
    'gold': 'GC=F', 'emas': 'GC=F', 'btc': 'BTC-USD', 'bitcoin': 'BTC-USD'
  };
  var TICKER_HINT_RE = /(usa100|nasdaq100|nasdaq|xauusd|gold|emas|btc|bitcoin)/i;
  /* Ambil simbol dari pola "harga XXXX" / "price XXXX" (posterior token alfanumerik). Kunci huruf besar 1-5 = ticker saham. */
  function extractTicker(query) {
    if (!query) return '';
    var q = query.replace(/[?]/g, ' ');
    var hintMatch = q.match(TICKER_HINT_RE);
    if (hintMatch) return TICKER_HINTS[hintMatch[1].toLowerCase().replace(/\s+/g, '')] || hintMatch[1].toUpperCase();
    var priceM = q.match(/harga\s+(?:saham|emas|bitcoin)?\s*([A-Za-z0-9.\^]{1,6})|price\s+(?:of|for)?\s*([A-Za-z0-9.\^]{1,6})/i);
    var tok = priceM ? (priceM[1] || priceM[2]) : null;
    if (tok) {
      var up = tok.toUpperCase();
      if (/^[A-Z]{1,5}$/.test(up) || /^[A-Z0-9.\^]{1,6}$/.test(up)) return up;
    }
    return '';
  }

  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  }

  function fetchQuote(ticker) {
    var sym = (ticker || '').trim();
    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1d&range=5d&includePrePost=false';
    var proxies = [];
    var origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    if (origin) proxies.push(origin + '/api/quote?url=');
    proxies.push('https://api.allorigins.win/raw?url=');
    proxies.push('https://corsproxy.io/?url=');
    var idx = 0;
    function attempt() {
      if (idx >= proxies.length) return Promise.reject(new Error('all proxies failed'));
      var p = proxies[idx++];
      return fetch(p + encodeURIComponent(url), { signal: AbortSignal.timeout(12000) })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
        .catch(function (e) { return attempt(); })
        .then(function (j) {
          if (!j || !j.chart) return attempt();
          return j;
        });
    }
    return attempt().then(function (j) {
        var r = j && j.chart && j.chart.result && j.chart.result[0];
        if (!r) throw new Error('no result');
        var meta = r.meta || {};
        var currency = meta.currency || '';
        var name = meta.longName || meta.shortName || (meta.symbol ? meta.symbol.toUpperCase() : sym.toUpperCase());
        var open = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].open;
        var closes = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close;
        var high = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].high;
        var low = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].low;
        var ts = r.timestamp || [];
        var closesArr = (typeof closes === 'object' && closes.length) ? closes : [];
        var tsArr = (typeof ts === 'object' && ts.length) ? ts : [];
        var lastClose = closesArr.length ? closesArr[closesArr.length - 1] : null;
        var prevClose = closesArr.length > 1 ? closesArr[closesArr.length - 2] : null;
        var price = (lastClose != null) ? lastClose : meta.regularMarketPrice;
        if (price === null || price === undefined) throw new Error('no price');
        var prev = (prevClose != null) ? prevClose : ((meta.chartPreviousClose != null) ? meta.chartPreviousClose : meta.previousClose);
        var chg = (prev != null && prev !== 0) ? price - prev : null;
        var pct = (chg != null && prev && prev !== 0) ? (chg / prev) * 100 : null;
        var lastDay = lastClose;
        var openToday = (typeof open === 'object' && open.length) ? open[open.length - 1] : null;
        var high5 = (typeof high === 'object' && high.length) ? Math.max.apply(null, high.filter(function (v) { return v != null; })) : null;
        var low5 = (typeof low === 'object' && low.length) ? Math.min.apply(null, low.filter(function (v) { return v != null; })) : null;
        var lastTs = tsArr.length ? tsArr[tsArr.length - 1] : null;
        var when = lastTs ? new Date(lastTs * 1000) : (meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : null);
        var whenStr = when ? when.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '';
        var lines = [];
        lines.push('### ' + name + ' (' + meta.symbol + ')');
        lines.push('- Harga: ' + fmtNum(price) + ' ' + currency +
          (chg != null ? ' (' + (chg >= 0 ? '+' : '') + fmtNum(chg) + ' / ' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%)' : ''));
        if (openToday != null) lines.push('- Pembukaan: ' + fmtNum(openToday));
        if (lastDay != null) lines.push('- Penutupan terakhir: ' + fmtNum(lastDay));
        if (high5 != null && low5 != null) lines.push('- Kisaran 5 hari: ' + fmtNum(low5) + ' – ' + fmtNum(high5));
        if (whenStr) lines.push('- Diperbarui: ' + whenStr);
        lines.push('*Sumber: Yahoo Finance. Data pasar real-time, bukan saran investasi.*');
        return lines.join('\n');
      });
  }

  /* Jika query menyebut ticker perkirakan data pasar, gabung ke konteks web. */
  function quoteContext(query) {
    var t = extractTicker(query);
    if (!t) return Promise.resolve('');
    return fetchQuote(t).catch(function () { return ''; });
  }

  /* Simbol TradingView untuk widget chart visual (pelengkap, bukan sumber data angka). */
  function chartSymbol(query) {
    if (!query) return '';
    var q = String(query || '').toLowerCase();
    if (/\busa100\b|\bnasdaq100\b/.test(q)) return 'NASDAQ:NDX';
    if (/\bxauusd\b/.test(q)) return 'OANDA:XAUUSD';
    return '';
  }

  CC.search = {
    WEB_RE: WEB_RE,
    needsWeb: needsWeb,
    searchWeb: searchWeb,
    searchWebWikipedia: searchWebWikipedia,
    extractTicker: extractTicker,
    fetchQuote: fetchQuote,
    quoteContext: quoteContext,
    chartSymbol: chartSymbol
  };
})();
