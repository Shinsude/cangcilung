/* lib/ta.js — Technical Analysis v2 (Yahoo Finance + TradingView + SMC + Pro TA) */
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});

  var SYM = { XAUUSD: 'GC=F', NDX: '^NDX', NASDAQ: '^IXIC', US30: '^DJI', SPX: '^GSPC', DXY: 'DX-Y.NYB', VIX: '^VIX' };
  var PROXIES = ['https://api.allorigins.win/raw?url=', 'https://corsproxy.io/?url=', 'https://api.codetabs.com/v1/proxy?quest=', 'https://thingproxy.freeboard.io/fetch/'];

  function proxyUrl(target) {
    var list = [];
    var origin = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    list.push(origin + '/api/quote?url=');
    list.push('DIRECT');
    for (var i = 0; i < PROXIES.length; i++) list.push(PROXIES[i]);
    return list;
  }

  function proxyFetch(target, timeoutMs) {
    var list = proxyUrl(target);
    var idx = 0;
    var deadline = Date.now() + (timeoutMs || 12000);
    var perAttempt = Math.max(4000, Math.floor((timeoutMs || 12000) / list.length));
    function attempt() {
      if (idx >= list.length || Date.now() > deadline - 500) return Promise.reject(new Error('Semua sumber data gagal'));
      var mode = list[idx++];
      var url, label;
      if (mode === 'DIRECT') { url = target; label = 'langsung'; }
      else { url = mode + encodeURIComponent(target); label = mode.slice(8, 22).replace(/[?#].*/, ''); }
      var remaining = Math.max(1500, deadline - Date.now());
      return fetch(url, { signal: AbortSignal.timeout(Math.min(perAttempt, remaining)) })
        .then(function (r) {
          if (r.ok) return r.text();
          var err = new Error(label + ' HTTP ' + r.status);
          err.status = r.status;
          throw err;
        })
        .catch(function (err) {
          if (err.status === 404) throw err;
          return attempt();
        });
    }
    return attempt();
  }
  var INTERVAL_MAP = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '1d': '1d', '1w': '1wk', '1M': '1mo' };
  var PERIOD_MAP = { '1m': 7, '5m': 60, '15m': 60, '30m': 60, '1h': 730, '1d': 1825, '1w': 1825, '1M': 1825 };
  var _cache = {};
  var _chartRefs = {};
  var _memo = {};
  var CACHE_TTL = 60000;

  function memoCalc(key, data, fn) {
    var n = data.length;
    var last = data[n - 1];
    var fp = (n % 100000) + '|' + last.close + '|' + last.time;
    if (n > 2) fp += '|' + data[n - 2].close + '|' + data[Math.floor(n / 2)].close + '|' + data[0].close;
    var k = key + '|' + fp;
    if (_memo[k]) return _memo[k];
    var v = fn();
    if (_memo) _memo[k] = v;
    if (Object.keys(_memo).length > 200) _memo = {};
    return v;
  }

  function destroyChart(container) {
    var prev = _chartRefs[container];
    if (prev) {
      var ch = prev && prev.chart ? prev.chart : prev;
      var ro = prev && prev.ro ? prev.ro : null;
      if (ro && typeof ro.disconnect === 'function') { try { ro.disconnect(); } catch (e) {} }
      if (ch && typeof ch.remove === 'function') { try { ch.remove(); } catch (e) {} }
    }
    delete _chartRefs[container];
  }

  function cacheKey(sym, iv) { return sym + '|' + iv; }
  function getCached(key) { var e = _cache[key]; return e && (Date.now() - e.ts < CACHE_TTL) ? e.data : null; }
  function setCache(key, data) { _cache[key] = { data: data, ts: Date.now() }; }

  function validateData(data) {
    if (!Array.isArray(data) || data.length < 10) return false;
    for (var i = 0; i < Math.min(data.length, 5); i++) {
      var d = data[i];
      if (!d || typeof d.open !== 'number' || typeof d.close !== 'number') return false;
      if (isNaN(d.open) || isNaN(d.close) || isNaN(d.high) || isNaN(d.low)) return false;
      if (d.high < d.low) return false;
    }
    return true;
  }

  var SESSIONS = {
    sydney: { start: 22, end: 7, tz: 'Asia/Tokyo' },
    tokyo: { start: 0, end: 9, tz: 'Asia/Tokyo' },
    london: { start: 8, end: 17, tz: 'Europe/London' },
    newyork: { start: 13, end: 22, tz: 'America/New_York' }
  };

  function getCurrentSession() {
    var now = new Date();
    var utcH = now.getUTCHours();
    var sessions = [];
    if (utcH >= 0 && utcH < 9) sessions.push('Tokyo');
    if (utcH >= 8 && utcH < 17) sessions.push('London');
    if (utcH >= 13 && utcH < 22) sessions.push('New York');
    if (sessions.length === 0) sessions.push('Off-hours');
    var isOverlap = sessions.length > 1;
    return { active: sessions, overlap: isOverlap, utcHour: utcH, label: sessions.join(' + ') + (isOverlap ? ' (OVERLAP)' : '') };
  }

  function resolveSymbol(input) {
    var up = (input || '').toUpperCase().trim();
    if (SYM[up]) return SYM[up];
    if (/^(XAU|GOLD|EMAS)/.test(up)) return 'GC=F';
    if (/^(NDX|NASDAQ|US.*TECH)/.test(up)) return '^NDX';
    if (/^(DJI|DOW|US30)/.test(up)) return '^DJI';
    if (/^(SPX|S\&P)/.test(up)) return '^GSPC';
    if (/^(DXY|USD.*INDEX)/.test(up)) return 'DX-Y.NYB';
    if (/^(VIX|Fear)/.test(up)) return '^VIX';
    return up;
  }

  function toStooqSymbol(sym) {
    var s = sym.replace(/^"/, '').replace(/"/g, '');
    if (/^\^.+$/.test(s) || s === 'GC=F') {
      var map = { '^NDX': '^ndx', '^IXIC': '^ndq', '^DJI': '^dji', '^GSPC': '^spx', '^VIX': '^vix', 'GC=F': 'xauusd' };
      return map[s] || null;
    }
    return null;
  }

  function stooqInterval(iv) {
    return { '1d': 'd', '1w': 'w', '1M': 'm' }[iv] || 'd';
  }

  function fetchStooq(sym, iv) {
    var ss = toStooqSymbol(sym);
    if (!ss) return Promise.reject(new Error('Stooq tidak mendukung ' + sym));
    var i = stooqInterval(iv);
    var url = 'https://stooq.com/q/d/l/?s=' + ss + '&i=' + i;
    return proxyFetch(url, 12000)
      .then(function (txt) {
        var lines = txt.trim().split('\n');
        if (lines.length < 2 || !/date/i.test(lines[0])) throw new Error('Stooq data kosong');
        var data = [];
        for (var i = 1; i < lines.length; i++) {
          var p = lines[i].split(',');
          if (p.length < 6) continue;
          var d = p[0].split('-');
          if (d.length !== 3) continue;
          var ts = Math.floor(Date.UTC(+d[0], +d[1] - 1, +d[2]) / 1000);
          var open = +p[1], high = +p[2], low = +p[3], close = +p[4], vol = +p[5] || 0;
          if (isNaN(close) || high < low) continue;
          data.push({ time: ts, open: open, high: high, low: low, close: close, volume: vol });
        }
        if (!validateData(data)) throw new Error('Stooq data validasi gagal');
        var out = { symbol: sym, name: sym, interval: iv, data: data, source: 'stooq' };
        setCache(cacheKey(sym, iv), out);
        return out;
      });
  }

  function fetchYahoo(symbol, interval) {
    var sym = resolveSymbol(symbol);
    var iv = INTERVAL_MAP[interval] || '1d';
    var ck = cacheKey(sym, iv);
    var cached = getCached(ck);
    if (cached) return Promise.resolve(cached);
    var period = PERIOD_MAP[iv] || 365;
    var now = Math.floor(Date.now() / 1000);
    var p1 = now - period * 86400;
    var hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
    var hIdx = 0;
    function tryHost() {
      if (hIdx >= hosts.length) return Promise.reject(new Error('Semua host Yahoo gagal'));
      var url = 'https://' + hosts[hIdx++] + '/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=' + iv + '&period1=' + p1 + '&period2=' + now + '&includePrePost=false';
      return proxyFetch(url, 12000)
        .then(function (txt) {
          var j;
          try { j = JSON.parse(txt); } catch (e) { throw new Error('Respon Yahoo bukan JSON'); }
          var result = j.chart && j.chart.result && j.chart.result[0];
          if (!result) throw new Error('Data tidak ditemukan untuk ' + sym);
          var ts = result.timestamp || [];
          var q = result.indicators && result.indicators.quote && result.indicators.quote[0];
          if (!q || !ts.length) throw new Error('Data kosong untuk ' + sym);
          var data = [];
          for (var i = 0; i < ts.length; i++) {
            if (q.open[i] != null && q.close[i] != null && q.high[i] != null && q.low[i] != null) {
              data.push({
                time: ts[i],
                open: +q.open[i],
                high: +q.high[i],
                low: +q.low[i],
                close: +q.close[i],
                volume: q.volume ? (q.volume[i] || 0) : 0
              });
            }
          }
          if (!validateData(data)) throw new Error('Data validasi gagal');
          var out = { symbol: sym, name: result.meta && result.meta.shortName || sym, interval: iv, data: data, source: 'yahoo' };
          setCache(ck, out);
          return out;
        })
        .catch(function (err) {
          if (err && err.status === 404) throw err;
          return tryHost();
        });
    }
    return tryHost().catch(function (err) {
      return fetchStooq(sym, iv);
    });
  }

  function fetchWithFallback(symbol, interval) {
    return fetchYahoo(symbol, interval);
  }

  function fetchMultiTF(symbol) {
    var tfs = ['15m', '1h', '1d'];
    return Promise.all(tfs.map(function (tf) {
      return fetchYahoo(symbol, tf).catch(function () { return null; });
    })).then(function (results) {
      return { '15m': results[0], '1h': results[1], '1d': results[2] };
    });
  }

  function fetchCorrelation(symbol) {
    var corrMap = { 'GC=F': 'DX-Y.NYB', '^NDX': '^VIX' };
    var corrSym = corrMap[resolveSymbol(symbol)];
    if (!corrSym) return Promise.resolve(null);
    return fetchYahoo(corrSym, '1d').catch(function () { return null; });
  }

  function calcSMA(data, period) {
    var out = [];
    for (var i = 0; i < data.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      var sum = 0;
      for (var j = i - period + 1; j <= i; j++) sum += data[j].close;
      out.push({ time: data[i].time, value: +(sum / period).toFixed(4) });
    }
    return out;
  }

  function calcEMA(data, period) {
    var out = [];
    var k = 2 / (period + 1);
    var ema = null;
    for (var i = 0; i < data.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      if (ema === null) {
        var sum = 0;
        for (var j = i - period + 1; j <= i; j++) sum += data[j].close;
        ema = sum / period;
      } else {
        ema = data[i].close * k + ema * (1 - k);
      }
      out.push({ time: data[i].time, value: +ema.toFixed(4) });
    }
    return out;
  }

  function calcRSI(data, period) {
    period = period || 14;
    var out = [];
    var gains = [], losses = [];
    for (var i = 0; i < data.length; i++) {
      if (i === 0) { out.push(null); continue; }
      var diff = data[i].close - data[i - 1].close;
      gains.push(diff > 0 ? diff : 0);
      losses.push(diff < 0 ? -diff : 0);
      if (i < period) { out.push(null); continue; }
      var avgGain, avgLoss;
      if (i === period) {
        var sg = 0, sl = 0;
        for (var j = 0; j < period; j++) { sg += gains[j]; sl += losses[j]; }
        avgGain = sg / period;
        avgLoss = sl / period;
      } else {
        avgGain = (out[out.length - 2] !== null ? gains[gains.length - 2] : 0);
        avgLoss = (out[out.length - 2] !== null ? losses[losses.length - 2] : 0);
        avgGain = ((gains[gains.length - 2] || 0) * (period - 1) + gains[gains.length - 1]) / period;
        avgLoss = ((losses[losses.length - 2] || 0) * (period - 1) + losses[losses.length - 1]) / period;
      }
      var rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out.push({ time: data[i].time, value: +(100 - 100 / (1 + rs)).toFixed(2) });
    }
    return out;
  }

  function calcMACD(data, fast, slow, sig) {
    fast = fast || 12; slow = slow || 26; sig = sig || 9;
    var emaFast = calcEMA(data, fast);
    var emaSlow = calcEMA(data, slow);
    var macdLine = [];
    for (var i = 0; i < data.length; i++) {
      if (emaFast[i] == null || emaSlow[i] == null) { macdLine.push(null); continue; }
      macdLine.push({ time: data[i].time, value: +(emaFast[i].value - emaSlow[i].value).toFixed(4) });
    }
    var validMacd = macdLine.filter(function (m) { return m !== null; });
    var signalLine = calcEMAFix(validMacd, sig);
    var histogram = [];
    var sigIdx = 0;
    for (var i = 0; i < macdLine.length; i++) {
      if (macdLine[i] === null) { histogram.push(null); continue; }
      if (sigIdx < signalLine.length) {
        histogram.push({ time: macdLine[i].time, value: +(macdLine[i].value - signalLine[sigIdx].value).toFixed(4) });
        sigIdx++;
      } else {
        histogram.push(null);
      }
    }
    return { macd: macdLine, signal: signalLine, histogram: histogram };
  }

  function calcEMAFix(data, period) {
    var out = [];
    var k = 2 / (period + 1);
    var ema = null;
    for (var i = 0; i < data.length; i++) {
      if (i < period - 1) continue;
      if (ema === null) {
        var sum = 0;
        for (var j = i - period + 1; j <= i; j++) sum += data[j].value;
        ema = sum / period;
      } else {
        ema = data[i].value * k + ema * (1 - k);
      }
      out.push({ time: data[i].time, value: +ema.toFixed(4) });
    }
    return out;
  }

  function calcBollinger(data, period, mult) {
    period = period || 20; mult = mult || 2;
    var upper = [], middle = [], lower = [];
    for (var i = 0; i < data.length; i++) {
      if (i < period - 1) { upper.push(null); middle.push(null); lower.push(null); continue; }
      var sum = 0;
      for (var j = i - period + 1; j <= i; j++) sum += data[j].close;
      var sma = sum / period;
      var sqDiff = 0;
      for (var j = i - period + 1; j <= i; j++) sqDiff += Math.pow(data[j].close - sma, 2);
      var std = Math.sqrt(sqDiff / period);
      middle.push({ time: data[i].time, value: +sma.toFixed(4) });
      upper.push({ time: data[i].time, value: +(sma + mult * std).toFixed(4) });
      lower.push({ time: data[i].time, value: +(sma - mult * std).toFixed(4) });
    }
    return { upper: upper, middle: middle, lower: lower };
  }

  function detectPatterns(data) {
    var patterns = [];
    for (var i = 2; i < data.length; i++) {
      var c = data[i], p = data[i - 1], pp = data[i - 2];
      var body = Math.abs(c.close - c.open);
      var range = c.high - c.low;
      var upperWick = c.high - Math.max(c.open, c.close);
      var lowerWick = Math.min(c.open, c.close) - c.low;
      var pBody = Math.abs(p.close - p.open);
      var bullish = c.close > c.open;
      var pBullish = p.close > p.open;
      if (range === 0) continue;
      if (body / range < 0.1 && lowerWick > body * 2) {
        patterns.push({ time: c.time, text: 'Hammer', bullish: true });
      }
      if (body / range < 0.1 && upperWick > body * 2) {
        patterns.push({ time: c.time, text: 'Shooting Star', bullish: false });
      }
      if (body / range < 0.1) {
        patterns.push({ time: c.time, text: 'Doji', bullish: null });
      }
      if (!pBullish && bullish && c.close > p.open && c.open < p.close) {
        patterns.push({ time: c.time, text: 'Bullish Engulfing', bullish: true });
      }
      if (pBullish && !bullish && c.open > p.close && c.close < p.open) {
        patterns.push({ time: c.time, text: 'Bearish Engulfing', bullish: false });
      }
      if (p.close < p.open && bullish && body > pBody * 2 && c.open <= p.close) {
        patterns.push({ time: c.time, text: 'Bullish Marubozu', bullish: true });
      }
      if (p.close > p.open && !bullish && body > pBody * 2 && c.open >= p.close) {
        patterns.push({ time: c.time, text: 'Bearish Marubozu', bullish: false });
      }
      var pRange = p.high - p.low;
      if (pRange > 0 && range < pRange * 0.3 && body < pRange * 0.1) {
        patterns.push({ time: c.time, text: 'Inside Bar', bullish: null });
      }
    }
    return patterns;
  }

  function detectSwingPoints(data, lookback) {
    lookback = lookback || 5;
    var swings = [];
    for (var i = lookback; i < data.length - lookback; i++) {
      var isHigh = true, isLow = true;
      for (var j = 1; j <= lookback; j++) {
        if (data[i].high < data[i - j].high || data[i].high < data[i + j].high) isHigh = false;
        if (data[i].low > data[i - j].low || data[i].low > data[i + j].low) isLow = false;
      }
      if (isHigh) swings.push({ time: data[i].time, type: 'resistance', value: data[i].high });
      if (isLow) swings.push({ time: data[i].time, type: 'support', value: data[i].low });
    }
    return swings;
  }

  function detectSR(data, lookback) {
    var swings = detectSwingPoints(data, lookback);
    if (!swings.length) return { supports: [], resistances: [] };
    var supports = swings.filter(function (s) { return s.type === 'support'; }).map(function (s) { return s.value; });
    var resistances = swings.filter(function (s) { return s.type === 'resistance'; }).map(function (s) { return s.value; });
    function cluster(levels, threshold) {
      if (!levels.length) return [];
      levels.sort(function (a, b) { return a - b; });
      var clusters = [], group = [levels[0]];
      for (var i = 1; i < levels.length; i++) {
        if (Math.abs(levels[i] - group[group.length - 1]) / group[group.length - 1] < threshold) {
          group.push(levels[i]);
        } else {
          clusters.push({ level: group.reduce(function (a, b) { return a + b; }, 0) / group.length, touches: group.length });
          group = [levels[i]];
        }
      }
      clusters.push({ level: group.reduce(function (a, b) { return a + b; }, 0) / group.length, touches: group.length });
      return clusters.sort(function (a, b) { return b.touches - a.touches; });
    }
    return { supports: cluster(supports, 0.005), resistances: cluster(resistances, 0.005) };
  }

  function calcFibonacci(data) {
    var high = -Infinity, low = Infinity, highIdx = 0, lowIdx = 0;
    for (var i = 0; i < data.length; i++) {
      if (data[i].high > high) { high = data[i].high; highIdx = i; }
      if (data[i].low < low) { low = data[i].low; lowIdx = i; }
    }
    var levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    var isUptrend = lowIdx < highIdx;
    var range = high - low;
    var fibs = levels.map(function (l) {
      var val = isUptrend ? high - range * l : low + range * l;
      return { level: l, value: +val.toFixed(4), label: l === 0 ? '0%' : l === 1 ? '100%' : (l * 100).toFixed(1) + '%' };
    });
    return { trend: isUptrend ? 'uptrend' : 'downtrend', high: high, low: low, levels: fibs };
  }

  function calcPivots(data) {
    var prev = data.length > 1 ? data[data.length - 2] : data[data.length - 1];
    var H = prev.high, L = prev.low, C = prev.close;
    var PP = (H + L + C) / 3;
    var R1 = 2 * PP - L;
    var S1 = 2 * PP - H;
    var R2 = PP + (H - L);
    var S2 = PP - (H - L);
    var R3 = H + 2 * (PP - L);
    var S3 = L - 2 * (H - PP);
    return {
      PP: +PP.toFixed(4),
      R1: +R1.toFixed(4), R2: +R2.toFixed(4), R3: +R3.toFixed(4),
      S1: +S1.toFixed(4), S2: +S2.toFixed(4), S3: +S3.toFixed(4)
    };
  }

  function calcATR(data, period) {
    period = period || 14;
    var trs = [];
    for (var i = 0; i < data.length; i++) {
      if (i === 0) { trs.push(data[i].high - data[i].low); continue; }
      var tr = Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close));
      trs.push(tr);
    }
    var atr = null;
    var out = [];
    for (var i = 0; i < trs.length; i++) {
      if (i < period - 1) { out.push(null); continue; }
      if (atr === null) {
        var sum = 0;
        for (var j = i - period + 1; j <= i; j++) sum += trs[j];
        atr = sum / period;
      } else {
        atr = (atr * (period - 1) + trs[i]) / period;
      }
      out.push({ time: data[i].time, value: +atr.toFixed(4) });
    }
    return out;
  }

  function calcStochastic(data, kPeriod, dPeriod) {
    kPeriod = kPeriod || 14; dPeriod = dPeriod || 3;
    var kValues = [];
    for (var i = 0; i < data.length; i++) {
      if (i < kPeriod - 1) { kValues.push(null); continue; }
      var high = -Infinity, low = Infinity;
      for (var j = i - kPeriod + 1; j <= i; j++) {
        if (data[j].high > high) high = data[j].high;
        if (data[j].low < low) low = data[j].low;
      }
      var k = high === low ? 50 : (data[i].close - low) / (high - low) * 100;
      kValues.push({ time: data[i].time, value: +k.toFixed(2) });
    }
    var dValues = [];
    var validK = kValues.filter(function (k) { return k !== null; });
    for (var i = 0; i < validK.length; i++) {
      if (i < dPeriod - 1) { dValues.push(null); continue; }
      var sum = 0;
      for (var j = i - dPeriod + 1; j <= i; j++) sum += validK[j].value;
      dValues.push({ time: validK[i].time, value: +(sum / dPeriod).toFixed(2) });
    }
    return { k: kValues, d: dValues };
  }

  function multiTFAnalysis(dataDaily, dataHourly, data15m) {
    var tfs = [];
    var names = [['15m', data15m], ['1h', dataHourly], ['1d', dataDaily]];
    names.forEach(function (pair) {
      var name = pair[0], d = pair[1];
      if (!d || !d.data || !d.data.length) { tfs.push({ tf: name, trend: 'n/a', rsi: '-', macd: '-', struct: 'n/a', score: 0 }); return; }
      if (d.data.length < 50) { tfs.push({ tf: name, trend: 'n/a', rsi: '-', macd: '-', struct: 'n/a', score: 0 }); return; }
      var ema20 = calcEMA(d.data, 20);
      var ema50 = calcEMA(d.data, 50);
      var last20 = ema20.filter(function (e) { return e !== null; }).slice(-1)[0];
      var last50 = ema50.filter(function (e) { return e !== null; }).slice(-1)[0];
      var trend = 'sideways';
      if (last20 && last50) {
        var diff = (last20.value - last50.value) / last50.value * 100;
        trend = Math.abs(diff) < 0.2 ? 'sideways' : diff > 0 ? 'bullish' : 'bearish';
      }
      var rsiArr = calcRSI(d.data, 14);
      var rsiV = rsiArr.filter(function (r) { return r !== null; }).slice(-1)[0];
      var rsiStr = rsiV ? rsiV.value.toFixed(0) + (rsiV.value > 70 ? ' (OB)' : rsiV.value < 30 ? ' (OS)' : '') : '-';
      var macd = calcMACD(d.data);
      var histArr = macd.histogram.filter(function (h) { return h !== null; });
      var macdStr = histArr.length ? (histArr[histArr.length - 1].value > 0 ? 'BULL' : 'BEAR') : '-';
      var ms = detectMarketStructure(d.data);
      var struct = ms.structure.split(' ')[0];
      var scoreT = trend === 'bullish' ? 1 : trend === 'bearish' ? -1 : 0;
      if (rsiV && rsiV.value > 55) scoreT += 1; else if (rsiV && rsiV.value < 45) scoreT -= 1;
      if (macdStr === 'BULL') scoreT += 1; else if (macdStr === 'BEAR') scoreT -= 1;
      tfs.push({ tf: name, trend: trend, rsi: rsiStr, macd: macdStr, struct: struct, score: scoreT });
    });
    var total = tfs.reduce(function (a, t) { return a + t.score; }, 0);
    var confluent = total >= 2 ? 'BULLISH CONFLUENCE' : total <= -2 ? 'BEARISH CONFLUENCE' : (total === 0 ? 'NEUTRAL' : 'MIXED');
    return {
      tfs: tfs,
      totalScore: total,
      confluence: confluent,
      daily: tfs.find(function (t) { return t.tf === '1d'; }),
      hourly: tfs.find(function (t) { return t.tf === '1h'; }),
      min15: tfs.find(function (t) { return t.tf === '15m'; })
    };
  }

  function detectOrderBlocks(data) {
    var obs = [];
    for (var i = 2; i < data.length; i++) {
      var c0 = data[i - 2], c1 = data[i - 1], c2 = data[i];
      var body0 = Math.abs(c0.close - c0.open);
      var body2 = Math.abs(c2.close - c2.open);
      var move = Math.abs(c2.close - c1.close);
      if (c0.close > c0.open && c2.close < c2.open && body2 > body0 * 1.5 && move > body0) {
        var strength = Math.min(100, c2.volume && c0.volume ? Math.round(c2.volume / c0.volume * 100) : 50);
        obs.push({ time: c0.time, type: 'bearish_ob', high: Math.max(c0.open, c0.close), low: Math.min(c0.open, c0.close), index: i - 2, strength: strength, context: strength > 150 ? 'KONFIRMASI volume tinggi (institutional)' : 'volume normal' });
      }
      if (c0.close < c0.open && c2.close > c2.open && body2 > body0 * 1.5 && move > body0) {
        var strength = Math.min(100, c2.volume && c0.volume ? Math.round(c2.volume / c0.volume * 100) : 50);
        obs.push({ time: c0.time, type: 'bullish_ob', high: Math.max(c0.open, c0.close), low: Math.min(c0.open, c0.close), index: i - 2, strength: strength, context: strength > 150 ? 'KONFIRMASI volume tinggi (institutional)' : 'volume normal' });
      }
    }
    return obs.slice(-10);
  }

  function calcSwingPoints(data, lookback) {
    lookback = lookback || 5;
    var swingHighs = [], swingLows = [];
    for (var i = lookback; i < data.length - lookback; i++) {
      var isHigh = true, isLow = true;
      for (var j = 1; j <= lookback; j++) {
        if (data[i].high < data[i - j].high || data[i].high < data[i + j].high) isHigh = false;
        if (data[i].low > data[i - j].low || data[i].low > data[i + j].low) isLow = false;
      }
      if (isHigh) swingHighs.push({ idx: i, price: data[i].high });
      if (isLow) swingLows.push({ idx: i, price: data[i].low });
    }
    return { swingHighs: swingHighs, swingLows: swingLows };
  }

  function detectBOS(data) {
    var lookback = 5;
    var events = [];
    var sw = calcSwingPoints(data, lookback);
    var swingHighs = sw.swingHighs, swingLows = sw.swingLows;
    for (var i = Math.max(1, data.length - 20); i < data.length; i++) {
      for (var k = 0; k < swingHighs.length; k++) {
        if (swingHighs[k].idx < i && data[i].close > swingHighs[k].price && data[i - 1].close <= swingHighs[k].price) {
          events.push({ time: data[i].time, type: 'BOS_BULL', level: swingHighs[k].price, index: i });
        }
      }
      for (var k = 0; k < swingLows.length; k++) {
        if (swingLows[k].idx < i && data[i].close < swingLows[k].price && data[i - 1].close >= swingLows[k].price) {
          events.push({ time: data[i].time, type: 'BOS_BEAR', level: swingLows[k].price, index: i });
        }
      }
    }
    return events.slice(-5);
  }

  function detectChoCH(data) {
    var lookback = 5;
    var events = [];
    var sw = calcSwingPoints(data, lookback);
    var swingHighs = sw.swingHighs, swingLows = sw.swingLows;
    var prevHigh = null, prevLow = null;
    for (var k = 0; k < swingHighs.length; k++) {
      if (prevHigh !== null && swingHighs[k].price < prevHigh) {
        events.push({ time: data[swingHighs[k].idx].time, type: 'ChoCH_BEAR', level: swingHighs[k].price, index: swingHighs[k].idx });
      }
      prevHigh = swingHighs[k].price;
    }
    for (var k = 0; k < swingLows.length; k++) {
      if (prevLow !== null && swingLows[k].price > prevLow) {
        events.push({ time: data[swingLows[k].idx].time, type: 'ChoCH_BULL', level: swingLows[k].price, index: swingLows[k].idx });
      }
      prevLow = swingLows[k].price;
    }
    return events.slice(-5);
  }

  function detectFVG(data) {
    var gaps = [];
    for (var i = 2; i < data.length; i++) {
      var c0 = data[i - 2], c2 = data[i];
      if (c0.high < c2.low) {
        gaps.push({ time: data[i - 1].time, type: 'bullish_fvg', top: c2.low, bottom: c0.high, index: i - 1 });
      }
      if (c0.low > c2.high) {
        gaps.push({ time: data[i - 1].time, type: 'bearish_fvg', top: c0.low, bottom: c2.high, index: i - 1 });
      }
    }
    var last = data[data.length - 1];
    return gaps.filter(function (g) { return Math.abs(g.top - last.close) / last.close < 0.05; }).slice(-5);
  }

  function detectLiquidity(data) {
    var lookback = 5;
    var zones = [];
    var swingHighs = [], swingLows = [];
    for (var i = lookback; i < data.length - lookback; i++) {
      var isHigh = true, isLow = true;
      for (var j = 1; j <= lookback; j++) {
        if (data[i].high < data[i - j].high || data[i].high < data[i + j].high) isHigh = false;
        if (data[i].low > data[i - j].low || data[i].low > data[i + j].low) isLow = false;
      }
      if (isHigh) swingHighs.push({ time: data[i].time, price: data[i].high, touches: 1 });
      if (isLow) swingLows.push({ time: data[i].time, price: data[i].low, touches: 1 });
    }
    swingHighs.forEach(function (sh) {
      var nearby = swingHighs.filter(function (h) { return Math.abs(h.price - sh.price) / sh.price < 0.003; });
      if (nearby.length >= 2) zones.push({ time: sh.time, type: 'sell_side_liq', price: sh.price, touches: nearby.length });
    });
    swingLows.forEach(function (sl) {
      var nearby = swingLows.filter(function (l) { return Math.abs(l.price - sl.price) / sl.price < 0.003; });
      if (nearby.length >= 2) zones.push({ time: sl.time, type: 'buy_side_liq', price: sl.price, touches: nearby.length });
    });
    return zones.slice(-10);
  }

  function calcPremiumDiscount(data) {
    if (data.length < 20) return null;
    var high = -Infinity, low = Infinity;
    for (var i = data.length - 20; i < data.length; i++) {
      if (data[i].high > high) high = data[i].high;
      if (data[i].low < low) low = data[i].low;
    }
    var range = high - low;
    var mid = low + range * 0.5;
    var current = data[data.length - 1].close;
    var pos = (current - low) / range;
    var zone = pos > 0.618 ? 'PREMIUM (jangan beli)' : pos < 0.382 ? 'DISCOUNT (peluang beli)' : 'EQUILIBRIUM';
    return { high: high, low: low, mid: mid, range: range, position: +pos.toFixed(3), zone: zone };
  }

  function calcVWAP(data) {
    var cumVolPrice = 0, cumVol = 0;
    var out = [];
    var periodStart = null;
    for (var i = 0; i < data.length; i++) {
      var typical = (data[i].high + data[i].low + data[i].close) / 3;
      cumVolPrice += typical * data[i].volume;
      cumVol += data[i].volume;
      var vwap = cumVol > 0 ? cumVolPrice / cumVol : data[i].close;
      out.push({ time: data[i].time, value: +vwap.toFixed(4) });
    }
    return out;
  }

  function calcIchimoku(data) {
    var tenkan = [], kijun = [], senkouA = [], senkouB = [], chikou = [];
    function periodHL(d, start, period) {
      var h = -Infinity, l = Infinity;
      for (var j = start; j >= Math.max(0, start - period + 1); j--) {
        if (d[j].high > h) h = d[j].high;
        if (d[j].low < l) l = d[j].low;
      }
      return (h + l) / 2;
    }
    for (var i = 0; i < data.length; i++) {
      if (i < 8) { tenkan.push(null); kijun.push(null); senkouA.push(null); senkouB.push(null); chikou.push(null); continue; }
      tenkan.push({ time: data[i].time, value: +periodHL(data, i, 9).toFixed(4) });
      kijun.push({ time: data[i].time, value: +periodHL(data, i, 26).toFixed(4) });
      var tenkanVal = periodHL(data, i, 9);
      var kijunVal = periodHL(data, i, 26);
      senkouA.push({ time: data[i].time, value: +((tenkanVal + kijunVal) / 2).toFixed(4) });
      if (i >= 26) {
        senkouB.push({ time: data[i].time, value: +periodHL(data, i, 52).toFixed(4) });
      } else {
        senkouB.push(null);
      }
      if (i >= 26) {
        chikou.push({ time: data[i - 26].time, value: data[i].close });
      }
    }
    return { tenkan: tenkan, kijun: kijun, senkouA: senkouA, senkouB: senkouB, chikou: chikou };
  }

  function detectHarmonic(data) {
    var patterns = [];
    var lookback = Math.min(60, data.length);
    var recent = data.slice(-lookback);
    var highs = [], lows = [];
    for (var i = 2; i < recent.length - 2; i++) {
      if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i + 1].high && recent[i].high > recent[i - 2].high && recent[i].high > recent[i + 2].high) {
        highs.push({ idx: i, price: recent[i].high });
      }
      if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i + 1].low && recent[i].low < recent[i - 2].low && recent[i].low < recent[i + 2].low) {
        lows.push({ idx: i, price: recent[i].low });
      }
    }
    var points = [];
    highs.forEach(function (h) { points.push({ idx: h.idx, price: h.price, type: 'H' }); });
    lows.forEach(function (l) { points.push({ idx: l.idx, price: l.price, type: 'L' }); });
    points.sort(function (a, b) { return a.idx - b.idx; });
    if (points.length >= 5) {
      for (var i = 0; i <= points.length - 5; i++) {
        var X = points[i], A = points[i + 1], B = points[i + 2], C = points[i + 3], D = points[i + 4];
        if (X.type === A.type || A.type === B.type || B.type === C.type || C.type === D.type) continue;
        var XA = Math.abs(A.price - X.price);
        var AB = Math.abs(B.price - A.price);
        var BC = Math.abs(C.price - B.price);
        var CD = Math.abs(D.price - C.price);
        var XD = Math.abs(D.price - X.price);
        if (XA === 0) continue;
        var avgPrice = (X.price + A.price + B.price + C.price + D.price) / 5;
        var minLeg = avgPrice * 0.003;
        if (XA < minLeg || AB < minLeg || BC < minLeg || CD < minLeg) continue;
        var abRatio = AB / XA;
        var bcRatio = BC / AB;
        var cdRatio = CD / BC;
        var xdRatio = XD / XA;
        var tolerance = 0.12;
        var harmonicPatterns = [
          { name: 'Gartley', ab: 0.618, bc: 0.382, cd: 0.886, xd: 0.786, abw: 3, bcw: 3, cdw: 3, xdw: 3 },
          { name: 'Butterfly', ab: 0.786, bc: 0.382, cd: 1.618, xd: 1.27, abw: 3, bcw: 3, cdw: 3, xdw: 3 },
          { name: 'Bat', ab: 0.382, bc: 0.382, cd: 1.618, xd: 0.886, abw: 3, bcw: 3, cdw: 3, xdw: 3 },
          { name: 'Crab', ab: 0.382, bc: 0.886, cd: 1.618, xd: 1.618, abw: 3, bcw: 3, cdw: 3, xdw: 3 },
          { name: 'Cipher', ab: 0.5, bc: 0.618, cd: 1.27, xd: 0.786, abw: 3, bcw: 3, cdw: 3, xdw: 3 }
        ];
        harmonicPatterns.forEach(function (hp) {
          var total = 0;
          var devs = [Math.abs(abRatio - hp.ab), Math.abs(bcRatio - hp.bc), Math.abs(cdRatio - hp.cd), Math.abs(xdRatio - hp.xd)];
          var hits = devs.filter(function (d) { return d < tolerance; }).length;
          if (hits >= 4) {
            var bullish = D.type === 'L';
            var confidence = Math.round(hits / 4 * 100);
            patterns.push({ time: recent[D.idx].time, name: hp.name, bullish: bullish, X: X, A: A, B: B, C: C, D: D, confidence: confidence, quality: confidence >= 90 ? 'KUAT' : confidence >= 70 ? 'SEDANG' : 'LEMAH' });
          }
        });
      }
    }
    return patterns.slice(-3);
  }

  function detectElliottWave(data) {
    if (data.length < 30) return null;
    var lookback = Math.min(60, data.length);
    var recent = data.slice(-lookback);
    var pivots = [];
    for (var i = 2; i < recent.length - 2; i++) {
      var isHigh = true, isLow = true;
      for (var j = 1; j <= 2; j++) {
        if (recent[i].high < recent[i - j].high || recent[i].high < recent[i + j].high) isHigh = false;
        if (recent[i].low > recent[i - j].low || recent[i].low > recent[i + j].low) isLow = false;
      }
      if (isHigh) pivots.push({ idx: i, price: recent[i].high, type: 'H' });
      if (isLow) pivots.push({ idx: i, price: recent[i].low, type: 'L' });
    }
    pivots.sort(function (a, b) { return a.idx - b.idx; });
    if (pivots.length < 5) return null;
    var last5 = pivots.slice(-5);
    var isImpulse = last5[0].type !== last5[1].type && last5[1].type !== last5[2].type &&
                    last5[2].type !== last5[3].type && last5[3].type !== last5[4].type;
    if (!isImpulse) return null;
    var direction = last5[4].price > last5[0].price ? 'bullish' : 'bearish';
    // Retracement rules: wave2 < 100% of wave1 (no overlap w/ origin); wave3 >= wave1; wave4 < 100% of wave3
    var m1 = Math.abs(last5[1].price - last5[0].price);
    var m2 = Math.abs(last5[2].price - last5[1].price);
    var m3 = Math.abs(last5[3].price - last5[2].price);
    var m4 = Math.abs(last5[4].price - last5[3].price);
    var valid = true;
    if (m1 === 0) valid = false;
    if (direction === 'bullish' && (last5[2].price < last5[0].price)) valid = false;
    if (direction === 'bearish' && (last5[2].price > last5[0].price)) valid = false;
    if (m2 < m1 * 0.1 || m2 > m1) valid = false;
    if (direction === 'bullish' && m3 < m1) valid = false;
    if (direction === 'bearish' && m3 < m1) valid = false;
    if (m4 > m3 * 0.9) valid = false;
    if (!valid) return null;
    var wave = last5.map(function (p, i) { return { wave: i + 1, price: p.price, type: p.type }; });
    var quality = m3 > m1 * 1.2 ? 'SEDANG' : 'KUAT';
    return { direction: direction, waves: wave, currentWave: 5, quality: quality, label: 'Impulse ' + (direction === 'bullish' ? '5-wave UP' : '5-wave DOWN') + ' [' + quality + ']' };
  }

  function calcVolumeProfile(data, bins) {
    bins = bins || 24;
    if (data.length < bins) return null;
    var high = -Infinity, low = Infinity;
    data.forEach(function (d) { if (d.high > high) high = d.high; if (d.low < low) low = d.low; });
    var range = high - low;
    if (range === 0) return null;
    var step = range / bins;
    var profiles = [];
    for (var i = 0; i < bins; i++) {
      var levelLow = low + i * step;
      var levelHigh = levelLow + step;
      var vol = 0;
      data.forEach(function (d) {
        var overlap = Math.min(d.high, levelHigh) - Math.max(d.low, levelLow);
        if (overlap > 0) vol += d.volume * (overlap / (d.high - d.low || 1));
      });
      profiles.push({ low: +levelLow.toFixed(4), high: +levelHigh.toFixed(4), mid: +((levelLow + levelHigh) / 2).toFixed(4), volume: Math.round(vol) });
    }
    var maxVol = Math.max.apply(null, profiles.map(function (p) { return p.volume; }));
    var avgVol = profiles.reduce(function (a, p) { return a + p.volume; }, 0) / bins;
    profiles.forEach(function (p) { p.poc = p.volume === maxVol; p.hvn = p.volume > avgVol * 1.5; p.lvn = p.volume < avgVol * 0.5; });
    var poc = profiles.filter(function (p) { return p.poc; })[0];
    var hvn = profiles.filter(function (p) { return p.hvn; });
    var lvn = profiles.filter(function (p) { return p.lvn; });
    var valueArea = profiles.filter(function (p) { return p.volume >= avgVol * 0.7; });
    return { profiles: profiles, poc: poc, hvn: hvn, lvn: lvn, valueArea: valueArea, range: { low: low, high: high } };
  }

  function detectMarketStructure(data) {
    var sw = calcSwingPoints(data, 5);
    var swingHighs = sw.swingHighs.map(function (p) { return { idx: p.idx, price: p.price, time: data[p.idx].time }; });
    var swingLows = sw.swingLows.map(function (p) { return { idx: p.idx, price: p.price, time: data[p.idx].time }; });
    var highs = swingHighs.slice(-5);
    var lows = swingLows.slice(-5);
    var hh = 0, hl = 0, lh = 0, ll = 0;
    for (var i = 1; i < highs.length; i++) { if (highs[i].price > highs[i - 1].price) hh++; else lh++; }
    for (var i = 1; i < lows.length; i++) { if (lows[i].price > lows[i - 1].price) hl++; else ll++; }
    var structure = 'ranging';
    if (hh >= 2 && hl >= 2) structure = 'uptrend (HH + HL)';
    else if (lh >= 2 && ll >= 2) structure = 'downtrend (LH + LL)';
    else if (hh >= 2 && ll >= 2) structure = 'choppy (HH + LL)';
    else if (lh >= 2 && hl >= 2) structure = 'choppy (LH + HL)';
    return { structure: structure, hh: hh, hl: hl, lh: lh, ll: ll, swingHighs: highs, swingLows: lows };
  }

  function calcCorrelation(data1, data2) {
    if (!data1 || !data2 || data1.length < 10 || data2.length < 10) return null;
    var map2 = {};
    data2.forEach(function (d) { map2[d.time] = d.close; });
    var pairs = [];
    data1.forEach(function (d) { if (map2[d.time] !== undefined) pairs.push({ x: d.close, y: map2[d.time] }); });
    if (pairs.length < 10) return null;
    var n = pairs.length;
    var sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    pairs.forEach(function (p) { sx += p.x; sy += p.y; sxx += p.x * p.x; syy += p.y * p.y; sxy += p.x * p.y; });
    var num = n * sxy - sx * sy;
    var den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    var r = den === 0 ? 0 : num / den;
    var strength = Math.abs(r) > 0.7 ? 'kuat' : Math.abs(r) > 0.4 ? 'sedang' : 'lemah';
    var direction = r > 0 ? 'positif' : 'negatif';
    return { coefficient: +r.toFixed(3), strength: strength, direction: direction, label: Math.abs(r).toFixed(2) + ' (' + strength + ' ' + direction + ')' };
  }

  function calcRiskManagement(data, accountSize, riskPercent) {
    accountSize = accountSize || 10000;
    riskPercent = riskPercent || 1;
    var last = data[data.length - 1];
    var atr = calcATR(data, 14);
    var lastATR = atr.filter(function (a) { return a !== null; }).slice(-1)[0];
    var atrVal = lastATR ? lastATR.value : (last.high - last.low);
    var slDistance = atrVal * 1.5;
    var tpDistance = atrVal * 3;
    var riskAmount = accountSize * (riskPercent / 100);
    var sl = last.close - slDistance;
    var tp = last.close + tpDistance;
    var lotSize = riskAmount / (slDistance * 100);
    return {
      entry: +last.close.toFixed(2),
      stopLoss: +sl.toFixed(2),
      takeProfit: +tp.toFixed(2),
      slDistance: +slDistance.toFixed(2),
      tpDistance: +tpDistance.toFixed(2),
      riskReward: +(tpDistance / slDistance).toFixed(2),
      riskAmount: +riskAmount.toFixed(2),
      lotSize: +lotSize.toFixed(2),
      atr: atrVal.toFixed(2)
    };
  }

  var WEIGHTS = {
    'RSI': 3, 'RSI OVERSOLD': 4, 'RSI OVERBOUGHT': 4,
    'MACD BULLISH': 4, 'MACD BEARISH': 4,
    'Trend naik': 3, 'Trend turun': 3, 'EMA20 > EMA50': 3, 'EMA20 < EMA50': 3,
    'bollinger': 3, 'SMA200': 3, 'Stochastic': 3,
    'Order Block BULLISH': 5, 'Order Block BEARISH': 5,
    'BOS BULLISH': 4, 'BOS BEARISH': 4,
    'ChoCH': 5, 'Fair Value Gap': 4,
    'Harmonic': 4, 'Elliott': 4, 'VWAP': 2, 'Ichimoku': 3
  };
  function scoreSignals(signals, data) {
    var score = 50;
    signals.forEach(function (s) {
      var bull = /BULLISH|bullish|OVERSOLD|oversold|continuation naik|rebound|breakout|naik|DISCOUNT|Higher/i.test(s);
      var bear = /BEARISH|bearish|OVERBOUGHT|overbought|continuation turun|koreksi|breakdown|turun|PREMIUM|Lower/i.test(s);
      var w = 3;
      for (var key in WEIGHTS) { if (s.indexOf(key) !== -1) { w = WEIGHTS[key]; break; } }
      if (bull && !bear) { score += w; }
      else if (bear && !bull) { score -= w; }
      else if (s.indexOf('POC') !== -1 || s.indexOf('Session') !== -1) { score += 2; }
    });
    if (/PREMIUM/i.test(signals.join(' '))) score -= 3;
    if (/DISCOUNT/i.test(signals.join(' '))) score += 3;
    if (/\bHH\b|Higher High|Higher Low/i.test(signals.join(' '))) score += 3;
    if (/\bLH\b|\bLL\b|Lower High|Lower Low/i.test(signals.join(' '))) score -= 3;
    score = Math.max(0, Math.min(100, score));
    var bias = score >= 58 ? 'BULLISH' : score <= 42 ? 'BEARISH' : 'NEUTRAL';
    var confidence = Math.min(90, Math.round(Math.abs(score - 50) * 1.8));
    var confluentCount = 0;
    var seen = {};
    signals.forEach(function (s) {
      if (/BULLISH|BEARISH/.test(s)) {
        var key = /BULLISH|BEARISH/.exec(s)[0];
        if (!seen[key]) { seen[key] = 0; }
        seen[key]++;
      }
    });
    confluentCount = (seen['BULLISH'] || 0) + (seen['BEARISH'] || 0);
    return { score: score, bias: bias, confidence: confidence, confluentCount: confluentCount, label: bias + ' (' + confidence + '% confidence, ' + confluentCount + ' signal searah)' };
  }

  var SHORT_NAMES = { rsi: 'RSI', macd: 'MACD', bb: 'Bollinger Bands', sma: 'SMA Cross', all: 'RSI+MACD+BB' };

  function genSignals(data, strategy, params) {
    params = params || {};
    var str = (strategy || 'rsi').toLowerCase();
    var out = new Array(data.length).fill('flat');
    if (str === 'rsi' || str === 'all') {
      var period = params.period || 14, ov = params.overbought || 70, os = params.oversold || 30;
      var rsiVals = calcRSI(data, period);
      for (var i = period; i < data.length; i++) {
        if (rsiVals[i] === null) continue;
        if (i > 0 && rsiVals[i - 1] !== null && rsiVals[i - 1] < os && rsiVals[i] >= os) out[i] = 'long';
        else if (i > 0 && rsiVals[i - 1] !== null && rsiVals[i - 1] > ov && rsiVals[i] <= ov) out[i] = 'short';
      }
    }
    if (str === 'macd' || str === 'all') {
      var macd = calcMACD(data);
      var hist = macd.histogram;
      for (var i = 1; i < data.length; i++) {
        if (hist[i] === null || hist[i - 1] === null) continue;
        if (hist[i - 1] <= 0 && hist[i] > 0) out[i] = 'long';
        else if (hist[i - 1] >= 0 && hist[i] < 0) out[i] = 'short';
      }
    }
    if (str === 'bb' || str === 'all') {
      var bb = calcBollinger(data, 20, 2);
      for (var i = 1; i < data.length; i++) {
        var lo = bb.lower[i], hi = bb.upper[i];
        if (lo === null || hi === null) continue;
        if (data[i - 1].close < lo && data[i].close >= lo) out[i] = 'long';
        else if (data[i - 1].close > hi && data[i].close <= hi) out[i] = 'short';
      }
    }
    if (str === 'sma') {
      var fast = params.fast || 20, slow = params.slow || 50;
      var f = calcSMA(data, fast), s = calcSMA(data, slow);
      for (var i = 1; i < data.length; i++) {
        if (f[i] === null || f[i - 1] === null || s[i] === null || s[i - 1] === null) continue;
        if (f[i - 1] <= s[i - 1] && f[i] > s[i]) out[i] = 'long';
        else if (f[i - 1] >= s[i - 1] && f[i] < s[i]) out[i] = 'short';
      }
    }
    return out;
  }

  function backtest(data, strategy, params) {
    if (!data || data.length < 60) return { error: 'Data terlalu sedikit untuk backtest' };
    params = params || {};
    var atrVal = (function () { var a = calcATR(data, 14).filter(Boolean); return a.length ? a[a.length - 1].value : (data[data.length - 1].high - data[data.length - 1].low); })();
    var slMult = params.sl || 2, tpMult = params.tp || 3;
    var signals = genSignals(data, strategy, params);
    var equity = params.initial || 10000;
    var equityCurve = [{ t: data[0].time, v: equity }];
    var trades = [];
    var pos = null;
    for (var i = 1; i < data.length; i++) {
      if (pos === null && signals[i] !== 'flat') {
        pos = { side: signals[i], entry: data[i].close, sl: data[i].close - slMult * atrVal, tp: data[i].close + tpMult * atrVal, i: i };
      } else if (pos !== null) {
        var pnl = 0, closed = false;
        var d = data[i];
        if (pos.side === 'long') {
          if (d.low <= pos.sl) { pnl = pos.sl - pos.entry; closed = true; }
          else if (d.high >= pos.tp) { pnl = pos.tp - pos.entry; closed = true; }
          else if (signals[i] === 'short') { pnl = d.close - pos.entry; closed = true; }
        } else {
          if (d.high >= pos.sl) { pnl = pos.entry - pos.sl; closed = true; }
          else if (d.low <= pos.tp) { pnl = pos.entry - pos.tp; closed = true; }
          else if (signals[i] === 'long') { pnl = pos.entry - d.close; closed = true; }
        }
        if (closed) {
          equity += pnl;
          pos = null;
        }
      }
      equityCurve.push({ t: data[i].time, v: +equity.toFixed(2) });
    }
    var wins = 0, losses = 0, grossWin = 0, grossLoss = 0;
    var peak = equityCurve[0].v, maxDD = 0;
    equityCurve.forEach(function (p) { if (p.v > peak) peak = p.v; var dd = peak - p.v; if (dd > maxDD) maxDD = dd; });
    for (var i = 0; i < equityCurve.length - 1; i++) {
      var change = equityCurve[i + 1].v - equityCurve[i].v;
      if (change > 0) { wins++; grossWin += change; }
      else if (change < 0) { losses++; grossLoss += -change; }
    }
    var winRate = (wins + losses) ? wins / (wins + losses) : 0;
    var profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
    return {
      strategy: SHORT_NAMES[strategy] || strategy,
      periods: data.length,
      trades: trades.length,
      closedSignals: wins + losses,
      winRate: +(winRate * 100).toFixed(2),
      profitFactor: profitFactor === Infinity ? '∞' : +profitFactor.toFixed(2),
      maxDrawdown: +maxDD.toFixed(2),
      finalEquity: +equity.toFixed(2),
      netProfit: +(equity - (params.initial || 10000)).toFixed(2),
      returnPct: +((equity / (params.initial || 10000) - 1) * 100).toFixed(2),
      equityCurve: equityCurve,
      expectancy: (wins + losses) ? +((grossWin - grossLoss) / (wins + losses)).toFixed(2) : 0,
      avgWin: wins ? +(grossWin / wins).toFixed(2) : 0,
      avgLoss: losses ? +(grossLoss / losses).toFixed(2) : 0
    };
  }

  function formatBacktest(r, symbol) {
    if (!r || r.error) return '⚠️ Backtest gagal: ' + (r && r.error);
    var out = '## Backtest ' + symbol.toUpperCase() + ' — ' + r.strategy + '\n\n';
    out += '**Periode:** ' + r.periods + ' candle\n';
    out += '- Trades selesai: ' + r.closedSignals + '\n';
    out += '- **Win Rate:** ' + r.winRate + '%\n';
    out += '- **Profit Factor:** ' + r.profitFactor + '\n';
    out += '- **Max Drawdown:** $' + r.maxDrawdown + '\n';
    out += '- **Net Profit:** ' + (r.netProfit >= 0 ? '+' : '') + '$' + r.netProfit + ' (' + r.returnPct + '%)\n';
    out += '- **Equity Akhir:** $' + r.finalEquity + '\n';
    out += '- **Expectancy:** $' + r.expectancy + '/trade\n';
    out += '- Avg Win: $' + r.avgWin + ' | Avg Loss: $' + r.avgLoss + '\n\n';
    if (r.winRate >= 50 && r.profitFactor >= 1.5) out += '\n🌟 Strategi ini **menguntungkan** (win rate & profit factor positif).';
    else if (r.winRate >= 50 || r.profitFactor >= 1) out += '\n⚖️ Strategi **netral** — tambahkan filter atau setel ulang parameter.';
    else out += '\n⚠️ Strategi ini **rugi** — kecilkan position atau cari entry yang lebih selektif.';
    return out;
  }

  function formatConfluence(mtf) {
    if (!mtf) return 'Multi-TF tidak tersedia.';
    var out = '### Konfluensi Multi-TF\n';
    out += '| TF | Trend | RSI | MACD | Struktur | Skor |\n';
    out += '|----|-------|-----|------|----------|------|\n';
    mtf.tfs.forEach(function (t) {
      out += '| ' + t.tf + ' | ' + (t.trend === 'bullish' ? '🟢' : t.trend === 'bearish' ? '🔴' : '⚪') + ' ' + t.trend + ' | ' + t.rsi + ' | ' + t.macd + ' | ' + t.struct + ' | ' + (t.score >= 0 ? '+' : '') + t.score + ' |\n';
    });
    out += '\n**Kesimpulan: ' + mtf.confluence + '** (skor total ' + mtf.totalScore + ')';
    return out;
  }

  var SENTI_POS = ['naik', 'rally', 'rekor', 'kuat', 'positif', 'surplus', 'keuntungan', 'tumbuh', 'gain', 'surge', 'jump', 'record', 'strong', 'bullish', 'optimistic', 'boost', 'higher', 'rise', 'meningkat', 'menguat'];
  var SENTI_NEG = ['turun', 'anjlok', 'jual', 'rugi', 'negatif', 'defisit', 'pelemahan', 'drop', 'crash', 'fall', 'plunge', 'record low', 'weak', 'bearish', 'pessimistic', 'penurunan', 'melemah', 'jeblok', 'korupsi', 'skandal', 'resesi'];

  function scoreNewsSentiment(text) {
    if (!text) return { score: 0, n: 0, label: 'Tidak ada data' };
    var lower = text.toLowerCase();
    var pos = SENTI_POS.filter(function (w) { return lower.indexOf(w) !== -1; }).length;
    var neg = SENTI_NEG.filter(function (w) { return lower.indexOf(w) !== -1; }).length;
    var total = pos + neg;
    var score = total === 0 ? 0 : ((pos - neg) / total);
    var label = score > 0.2 ? 'POSITIF' : score < -0.2 ? 'NEGATIF' : 'NETRAL';
    return { score: +score.toFixed(2), pos: pos, neg: neg, n: total, label: label };
  }

  var NEWS_FRIENDLY = { 'GC=F': 'gold', '^NDX': 'nasdaq', '^IXIC': 'nasdaq', '^DJI': 'dow jones', '^GSPC': 's&p 500', '^VIX': 'vix', 'DX-Y.NYB': 'dollar index' };
  var NEWS_QUERY = { 'GC=F': 'gold price', '^NDX': 'nasdaq', '^IXIC': 'nasdaq', '^DJI': 'dow jones', '^GSPC': 's&p 500', '^VIX': 'vix market', 'DX-Y.NYB': 'dollar index' };

  function sentimentFriendly(symbol) {
    var sym = resolveSymbol(symbol);
    return NEWS_FRIENDLY[sym] || sym.replace(/[^a-z]/gi, '').toLowerCase() || 'market';
  }

  function fetchNewsSentiment(symbol, opts) {
    opts = opts || {};
    var sym = resolveSymbol(symbol);
    var friendly = sentimentFriendly(sym);
    var query = NEWS_QUERY[sym] || friendly;
    var key = opts.newsKey || '';
    var ddgUrl = 'https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(friendly + ' news today') + '&kl=id-id';
    var sources = [];
    var out = [];

    function parseSearchHtml(html) {
      if (html && html.length >= 200 && typeof document !== 'undefined') {
        var tmp = document.createElement('div');
        tmp.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
        tmp.querySelectorAll('.result-snippet').forEach(function (el, i) { if (i < 6) sources.push(el.textContent.trim()); });
        tmp.querySelectorAll('td').forEach(function (el, i) { if (i < 10 && el.textContent.trim().length > 20) sources.push(el.textContent.trim()); });
      }
    }

    function runSearch() {
      return proxyFetch(ddgUrl, 12000)
        .then(parseSearchHtml)
        .then(function () {
          sources = sources.filter(function (s, i) { return sources.indexOf(s) === i; }).slice(0, 8);
          sources.forEach(function (s) { out.push({ text: s.slice(0, 140), score: scoreNewsSentiment(s) }); });
          var joined = sources.join(' ').slice(0, 3000);
          return { symbol: sym, friendly: friendly, headlines: out, aggregate: scoreNewsSentiment(joined), sources: sources.length, source: 'pencarian' };
        });
    }

    if (key) {
      var apiUrl = 'https://gnews.io/api/v4/search?q=' + encodeURIComponent(query) + '&lang=en&max=8&apikey=' + encodeURIComponent(key);
      return proxyFetch(apiUrl, 12000)
        .then(function (txt) { try { return JSON.parse(txt); } catch (e) { return null; } })
        .then(function (json) {
          if (json && Array.isArray(json.articles) && json.articles.length) {
            json.articles.slice(0, 8).forEach(function (art) {
              var t = (art.title || '') + ' ' + (art.description || '');
              out.push({ text: (art.title || art.description || '').slice(0, 140), score: scoreNewsSentiment(t), url: art.url || '' });
            });
            var joined = out.map(function (o) { return o.text; }).join(' ').slice(0, 3000);
            return { symbol: sym, friendly: friendly, headlines: out, aggregate: scoreNewsSentiment(joined), sources: out.length, source: 'gnews.io' };
          }
          return runSearch();
        })
        .catch(function () { return runSearch(); });
    }
    return runSearch()
      .catch(function () { return { symbol: sym, friendly: friendly, headlines: [], aggregate: { score: 0, pos: 0, neg: 0, n: 0, label: 'Gagal ambil berita' }, sources: 0 }; });
  }

  function formatNewsSentiment(ns) {
    if (!ns) return '⚠️ Berita tidak tersedia.';
    var a = ns.aggregate || {};
    var out = '## Sentimen Berita ' + ns.friendly.toUpperCase() + '\n\n';
    out += '**Agregat: ' + (a.label || 'N/A') + '** (score ' + (a.score != null ? a.score : 0) + ', berita ' + (a.n || 0) + ')\n';
    out += '- Kata positif: ' + (a.pos || 0) + ' | negatif: ' + (a.neg || 0) + '\n';
    if (ns.source) out += '- Sumber: ' + ns.source + '\n';
    out += '\n';
    if (ns.headlines && ns.headlines.length) {
      out += '### Judul Berita Terbaru\n';
      ns.headlines.slice(0, 6).forEach(function (h) {
        var mark = h.score.label === 'POSITIF' ? '🟢' : h.score.label === 'NEGATIF' ? '🔴' : '⚪';
        if (h.url) out += '- ' + mark + ' [' + h.text + '](' + h.url + ')\n';
        else out += '- ' + mark + ' ' + h.text + '\n';
      });
    } else {
      out += 'Tidak ada berita yang berhasil diambil. Coba lagi nanti.';
    }
    return out;
  }

  var _alerts = [];
  var _ALERT_KEY = 'cangcilung_alerts_v1';

  function _saveAlerts() {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(_ALERT_KEY, JSON.stringify(_alerts)); } catch (e) {}
  }
  function _loadAlerts() {
    try {
      if (typeof localStorage === 'undefined') return;
      var raw = localStorage.getItem(_ALERT_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          _alerts = arr.filter(function (a) { return a && typeof a.target !== 'undefined' && !isNaN(parseFloat(a.target)); });
        }
      }
    } catch (e) {}
  }
  _loadAlerts();

  function listAlerts() { return _alerts.slice(); }

  function addAlert(symbol, target, label) {
    target = parseFloat(target);
    if (isNaN(target)) return { error: 'Harga target tidak valid' };
    var a = { id: 'al' + Date.now() + Math.floor(Math.random() * 999), symbol: resolveSymbol(symbol), target: target, label: label || '', created: Date.now() };
    _alerts.push(a);
    _saveAlerts();
    return { ok: true, alert: a, count: _alerts.length };
  }

  function removeAlert(id) {
    var before = _alerts.length;
    _alerts = _alerts.filter(function (a) { return a.id !== id; });
    _saveAlerts();
    return { removed: before - _alerts.length };
  }

  function clearAlerts() { _alerts = []; _saveAlerts(); return { cleared: true }; }

  function checkAlerts(data) {
    var fired = [];
    var rows = (data && data.data) || data;
    if (!rows || !rows.length) return { alerts: _alerts, fired: fired };
    var last = rows[rows.length - 1];
    var sym = (data && data.symbol) || (rows.symbol) || null;
    _alerts = _alerts.filter(function (a) {
      if (sym && a.symbol !== sym) return true;
      var hit = (last.low <= a.target && a.target <= last.high) || (Math.abs(last.close - a.target) / last.close < 0.0005);
      if (hit) { fired.push({ id: a.id, symbol: a.symbol, target: a.target, price: last.close, label: a.label }); return false; }
      return true;
    });
    if (fired.length) _saveAlerts();
    return { alerts: _alerts.slice(), fired: fired };
  }

  function formatAlerts() {
    if (!_alerts.length) return 'Belum ada alert. Gunakan `/alert XAUUSD <harga>` untuk set alert harga.';
    var out = '## Alert Aktif (' + _alerts.length + ')\n';
    _alerts.forEach(function (a) {
      out += '- `' + a.id + '` — ' + a.symbol + ' @ **' + a.target + '**' + (a.label ? ' (' + a.label + ')' : '') + '\n';
    });
    return out;
  }

  function analyze(data) {
    var last = data[data.length - 1];
    var prev = data[data.length - 2];
    var rsi = memoCalc('rsi14', data, function () { return calcRSI(data, 14); });
    var macd = memoCalc('macd', data, function () { return calcMACD(data); });
    var bb = memoCalc('bb', data, function () { return calcBollinger(data, 20, 2); });
    var ema20 = memoCalc('ema20', data, function () { return calcEMA(data, 20); });
    var ema50 = memoCalc('ema50', data, function () { return calcEMA(data, 50); });
    var sma200 = memoCalc('sma200', data, function () { return calcSMA(data, 200); });
    var atr = memoCalc('atr14', data, function () { return calcATR(data, 14); });
    var stoch = calcStochastic(data);
    var sr = detectSR(data);
    var fib = calcFibonacci(data);
    var pivots = calcPivots(data);
    var vwap = calcVWAP(data);
    var ichimoku = calcIchimoku(data);
    var patterns = detectPatterns(data);
    var obs = detectOrderBlocks(data);
    var bosEvents = detectBOS(data);
    var chochEvents = detectChoCH(data);
    var fvg = detectFVG(data);
    var liq = detectLiquidity(data);
    var pd = calcPremiumDiscount(data);
    var harmonics = detectHarmonic(data);
    var elliott = detectElliottWave(data);
    var vp = calcVolumeProfile(data);
    var mktStruct = detectMarketStructure(data);
    var session = getCurrentSession();
    var sessionUTC = new Date().getUTCHours();
    var lastRSI = rsi.filter(function (r) { return r !== null; }).slice(-1)[0];
    var lastMACD = macd.histogram.filter(function (h) { return h !== null; }).slice(-1)[0];
    var lastBBUpper = bb.upper.filter(function (b) { return b !== null; }).slice(-1)[0];
    var lastBBLower = bb.lower.filter(function (b) { return b !== null; }).slice(-1)[0];
    var lastBBMiddle = bb.middle.filter(function (b) { return b !== null; }).slice(-1)[0];
    var lastEMA20 = ema20.filter(function (e) { return e !== null; }).slice(-1)[0];
    var lastEMA50 = ema50.filter(function (e) { return e !== null; }).slice(-1)[0];
    var lastSMA200 = sma200.filter(function (s) { return s !== null; }).slice(-1)[0];
    var lastATR = atr.filter(function (a) { return a !== null; }).slice(-1)[0];
    var lastK = stoch.k.filter(function (k) { return k !== null; }).slice(-1)[0];
    var lastD = stoch.d.filter(function (d) { return d !== null; }).slice(-1)[0];
    var lastVWAP = vwap[vwap.length - 1];
    var lastTenkan = ichimoku.tenkan.filter(function (t) { return t !== null; }).slice(-1)[0];
    var lastKijun = ichimoku.kijun.filter(function (k) { return k !== null; }).slice(-1)[0];
    var lastSenkouA = ichimoku.senkouA.filter(function (s) { return s !== null; }).slice(-1)[0];
    var lastSenkouB = ichimoku.senkouB.filter(function (s) { return s !== null; }).slice(-1)[0];
    var rsiVal = lastRSI ? lastRSI.value : null;
    var signals = [];
    if (rsiVal !== null) {
      if (rsiVal > 70) signals.push('RSI OVERBOUGHT (' + rsiVal + ') — potensi koreksi turun');
      else if (rsiVal < 30) signals.push('RSI OVERSOLD (' + rsiVal + ') — potensi rebound naik');
      else signals.push('RSI NETRAL (' + rsiVal + ')');
    }
    if (lastMACD) {
      if (lastMACD.value > 0) signals.push('MACD BULLISH — momentum naik');
      else signals.push('MACD BEARISH — momentum turun');
    }
    if (last.close > (lastBBUpper ? lastBBUpper.value : Infinity)) signals.push('Harga di atas Bollinger Upper — overbought / breakout');
    else if (last.close < (lastBBLower ? lastBBLower.value : -Infinity)) signals.push('Harga di bawah Bollinger Lower — oversold / breakdown');
    if (lastEMA20 && lastEMA50) {
      if (lastEMA20.value > lastEMA50.value) signals.push('EMA20 > EMA50 — trend naik');
      else signals.push('EMA20 < EMA50 — trend turun');
    }
    if (lastSMA200) {
      if (last.close > lastSMA200.value) signals.push('Harga di atas SMA200 — bullish long-term');
      else signals.push('Harga di bawah SMA200 — bearish long-term');
    }
    if (lastK && lastD) {
      if (lastK.value > 80) signals.push('Stochastic OVERBOUGHT (K=' + lastK.value + ')');
      else if (lastK.value < 20) signals.push('Stochastic OVERSOLD (K=' + lastK.value + ')');
      if (lastK.value > lastD.value) signals.push('Stochastic K > D — bullish crossover');
      else signals.push('Stochastic K < D — bearish crossover');
    }
    if (lastVWAP) {
      if (last.close > lastVWAP.value) signals.push('Harga di atas VWAP (' + lastVWAP.value.toFixed(2) + ') — bullish intraday');
      else signals.push('Harga di bawah VWAP (' + lastVWAP.value.toFixed(2) + ') — bearish intraday');
    }
    if (lastTenkan && lastKijun) {
      if (lastTenkan.value > lastKijun.value) signals.push('Ichimoku: Tenkan > Kijun — trend naik');
      else signals.push('Ichimoku: Tenkan < Kijun — trend turun');
    }
    if (lastSenkouA && lastSenkouB) {
      var cloudTop = Math.max(lastSenkouA.value, lastSenkouB.value);
      var cloudBot = Math.min(lastSenkouA.value, lastSenkouB.value);
      if (last.close > cloudTop) signals.push('Harga di atas Ichimoku Cloud — bullish');
      else if (last.close < cloudBot) signals.push('Harga di bawah Ichimoku Cloud — bearish');
      else signals.push('Harga di dalam Ichimoku Cloud — sideways/indecision');
    }
    var nearestSupport = sr.supports.filter(function (s) { return s.level < last.close; }).slice(0, 2);
    var nearestResist = sr.resistances.filter(function (r) { return r.level > last.close; }).slice(0, 2);
    if (nearestSupport.length) signals.push('Support terdekat: ' + nearestSupport.map(function (s) { return s.level.toFixed(2) + ' (' + s.touches + 'x)'; }).join(', '));
    if (nearestResist.length) signals.push('Resistance terdekat: ' + nearestResist.map(function (r) { return r.level.toFixed(2) + ' (' + r.touches + 'x)'; }).join(', '));
    var nearFib = fib.levels.filter(function (f) { return Math.abs(f.value - last.close) / last.close < 0.02; });
    if (nearFib.length) signals.push('Harga dekat Fibonacci ' + nearFib.map(function (f) { return f.label; }).join('/') + ' — level kunci');
    var nearestPivot = [pivots.S1, pivots.S2, pivots.PP, pivots.R1, pivots.R2].sort(function (a, b) { return Math.abs(a - last.close) - Math.abs(b - last.close); })[0];
    if (nearestPivot) signals.push('Pivot terdekat: ' + nearestPivot.toFixed(2));
    if (lastATR) signals.push('ATR(14): ' + lastATR.value.toFixed(2) + ' — volatilitas ' + (lastATR.value / last.close * 100 > 2 ? 'tinggi' : lastATR.value / last.close * 100 > 1 ? 'sedang' : 'rendah'));
    if (bosEvents.length) {
      var lastBOS = bosEvents[bosEvents.length - 1];
      signals.push(lastBOS.type === 'BOS_BULL' ? 'BOS BULLISH — ' + lastBOS.level.toFixed(2) + ' broke → continuation naik' : 'BOS BEARISH — ' + lastBOS.level.toFixed(2) + ' broke → continuation turun');
    }
    if (chochEvents.length) {
      var lastChoCH = chochEvents[chochEvents.length - 1];
      signals.push(lastChoCH.type === 'ChoCH_BULL' ? 'ChoCH BULLISH — perubahan karakter ke naik di ' + lastChoCH.level.toFixed(2) : 'ChoCH BEARISH — perubahan karakter ke turun di ' + lastChoCH.level.toFixed(2));
    }
    if (obs.length) {
      var lastOB = obs[obs.length - 1];
      signals.push((lastOB.type === 'bullish_ob' ? 'Order Block BULLISH' : 'Order Block BEARISH') + ' di ' + lastOB.low.toFixed(2) + '-' + lastOB.high.toFixed(2));
    }
    if (fvg.length) {
      var lastFVG = fvg[fvg.length - 1];
      signals.push((lastFVG.type === 'bullish_fvg' ? 'Fair Value Gap BULLISH' : 'Fair Value Gap BEARISH') + ' di ' + lastFVG.bottom.toFixed(2) + '-' + lastFVG.top.toFixed(2));
    }
    if (pd) signals.push('Premium/Discount: ' + pd.zone + ' (posisi ' + (pd.position * 100).toFixed(0) + '% dari range)');
    if (harmonics.length) {
      harmonics.forEach(function (h) { signals.push('Harmonic: ' + h.name + ' ' + (h.bullish ? 'BULLISH 🟢' : 'BEARISH 🔴') + (h.quality ? ' [' + h.quality + ']' : '')); });
    }
    if (elliott) signals.push('Elliott Wave: ' + elliott.label);
    if (mktStruct) signals.push('Market Structure: ' + mktStruct.structure);
    if (vp) signals.push('Volume Profile → POC di ' + vp.poc.mid.toFixed(2) + ' (Harga ' + (last.close > vp.poc.mid ? 'di atas' : 'di bawah') + ' POC)');
    if (session) signals.push('Session aktif: ' + session.label);
    var recentPatterns = patterns.slice(-5);
    var patternText = recentPatterns.length ? recentPatterns.map(function (p) { return p.text + (p.bullish === true ? ' (🟢)' : p.bullish === false ? ' (🔴)' : ' (⚪)'); }).join(', ') : 'Tidak ada';
    var change = prev ? ((last.close - prev.close) / prev.close * 100).toFixed(2) : '0';
    var sym = last.close > 4000 ? 'XAUUSD' : 'Nasdaq';
    var summary = '## Analisis ' + sym + '\n';
    summary += '**Harga:** ' + last.close.toFixed(2) + ' (' + (change >= 0 ? '+' : '') + change + '%)\n';
    summary += '**ATR(14):** ' + (lastATR ? lastATR.value.toFixed(2) : '-') + ' | **Stoch K/D:** ' + (lastK ? lastK.value : '-') + '/' + (lastD ? lastD.value : '-') + ' | **VWAP:** ' + (lastVWAP ? lastVWAP.value.toFixed(2) : '-') + '\n';
    summary += '**RSI(14):** ' + (rsiVal || '-') + ' | **MACD:** ' + (lastMACD ? (lastMACD.value > 0 ? 'Bullish' : 'Bearish') : '-') + '\n';
    summary += '**BB:** ' + (lastBBLower && lastBBUpper ? (last.close < lastBBLower.value ? 'Below Lower' : last.close > lastBBUpper.value ? 'Above Upper' : 'Inside') : '-') + ' | **EMA20/50:** ' + (lastEMA20 ? lastEMA20.value.toFixed(2) : '-') + '/' + (lastEMA50 ? lastEMA50.value.toFixed(2) : '-') + '\n';
    summary += '**SMA200:** ' + (lastSMA200 ? lastSMA200.value.toFixed(2) : '-') + ' | **Ichimoku:** ' + (lastTenkan && lastKijun ? (last.close > Math.max(lastSenkouA ? lastSenkouA.value : 0, lastSenkouB ? lastSenkouB.value : 0) ? 'Above Cloud' : last.close < Math.min(lastSenkouA ? lastSenkouA.value : Infinity, lastSenkouB ? lastSenkouB.value : Infinity) ? 'Below Cloud' : 'In Cloud') : '-') + '\n\n';
    summary += '### Support / Resistance\n';
    if (nearestSupport.length) summary += '- **Support:** ' + nearestSupport.map(function (s) { return s.level.toFixed(2) + ' (' + s.touches + 'x)'; }).join(' | ') + '\n';
    if (nearestResist.length) summary += '- **Resistance:** ' + nearestResist.map(function (r) { return r.level.toFixed(2) + ' (' + r.touches + 'x)'; }).join(' | ') + '\n';
    summary += '\n### Fibonacci (' + fib.trend + ')\n';
    fib.levels.forEach(function (f) { summary += '- **' + f.label + ':** ' + f.value.toFixed(2) + (Math.abs(f.value - last.close) / last.close < 0.01 ? ' ← DEKAT' : '') + '\n'; });
    if (pd) summary += '- **Premium/Discount:** ' + pd.zone + ' (' + (pd.position * 100).toFixed(0) + '%)\n';
    summary += '\n### Classic Pivots\n';
    summary += '- R3: ' + pivots.R3.toFixed(2) + ' | R2: ' + pivots.R2.toFixed(2) + ' | R1: ' + pivots.R1.toFixed(2) + ' | **PP: ' + pivots.PP.toFixed(2) + '** | S1: ' + pivots.S1.toFixed(2) + ' | S2: ' + pivots.S2.toFixed(2) + ' | S3: ' + pivots.S3.toFixed(2) + '\n';
    summary += '\n### Smart Money Concepts\n';
    if (bosEvents.length) summary += '- **BOS:** ' + bosEvents.map(function (b) { return b.type.replace('_', ' ') + ' @ ' + b.level.toFixed(2); }).join(' | ') + '\n';
    if (chochEvents.length) summary += '- **ChoCH:** ' + chochEvents.map(function (c) { return c.type.replace('_', ' ') + ' @ ' + c.level.toFixed(2); }).join(' | ') + '\n';
    if (obs.length) summary += '- **Order Blocks:** ' + obs.slice(-3).map(function (o) { return o.type.replace('_', ' ') + ' ' + o.low.toFixed(2) + '-' + o.high.toFixed(2) + (o.context ? ' (' + o.context + ')' : ''); }).join(' | ') + '\n';
    if (fvg.length) summary += '- **FVG:** ' + fvg.map(function (f) { return f.type.replace('_', ' ') + ' ' + f.bottom.toFixed(2) + '-' + f.top.toFixed(2); }).join(' | ') + '\n';
    if (liq.length) summary += '- **Liquidity:** ' + liq.slice(-3).map(function (l) { return l.type.replace('_', ' ') + ' @ ' + l.price.toFixed(2) + ' (' + l.touches + 'x)'; }).join(' | ') + '\n';
    if (harmonics.length) summary += '- **Harmonic:** ' + harmonics.map(function (h) { return h.name + ' ' + (h.bullish ? 'BULL' : 'BEAR') + (h.quality ? ' [' + h.quality + ']' : ''); }).join(', ') + '\n';
    if (elliott) summary += '- **Elliott Wave:** ' + elliott.label + '\n';
    summary += '\n### Patterns\n' + patternText + '\n\n';
    summary += '### Signal\n';
    summary += '- ' + mktStruct.structure + '\n';
    if (vp) summary += '- **POC (Point of Control):** ' + vp.poc.mid.toFixed(2) + ' — ' + (last.close > vp.poc.mid ? 'harga di atas' : 'harga di bawah') + ' POC' + '\n';
    if (vp && vp.hvn.length) summary += '- **High Volume Nodes (HVN):** ' + vp.hvn.slice(0, 3).map(function (h) { return h.mid.toFixed(2); }).join(' | ') + '\n';
    if (vp && vp.lvn.length) summary += '- **Low Volume Nodes (LVN):** ' + vp.lvn.slice(0, 3).map(function (l) { return l.mid.toFixed(2); }).join(' | ') + '\n';
    summary += '- **Sesi:** ' + (session ? session.label : '-') + '\n';
    var scoring = scoreSignals(signals, data);
    summary += '\n### Verdict\n';
    summary += '**Bias:** ' + scoring.bias + ' (' + scoring.confidence + '% confidence) | **Score:** ' + scoring.score + '/100\n';
    signals.forEach(function (s) { summary += '- ' + s + '\n'; });
    return summary;
  }

  function renderChart(container, data, indicators, title) {
    if (!window.LightweightCharts) {
      container.innerHTML = '<p style="color:#999;padding:20px">Chart library tidak tersedia.</p>';
      return;
    }
    destroyChart(container);
    container.innerHTML = '';
    var chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 400,
      layout: { background: { type: 'solid', color: '#1a1a2e' }, textColor: '#a0a0b0' },
      grid: { vertLines: { color: '#2a2a3e' }, horzLines: { color: '#2a2a3e' } },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#2a2a3e' }
    });
    _chartRefs[container] = chart;
    var candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444'
    });
    candleSeries.setData(data);
    if (indicators && indicators.ema20) {
      var ema20Line = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'EMA20' });
      ema20Line.setData(indicators.ema20.filter(function (d) { return d !== null; }));
    }
    if (indicators && indicators.ema50) {
      var ema50Line = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, title: 'EMA50' });
      ema50Line.setData(indicators.ema50.filter(function (d) { return d !== null; }));
    }
    if (indicators && indicators.bb) {
      var bbUp = chart.addLineSeries({ color: '#6b7280', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: 'BB Upper' });
      var bbMid = chart.addLineSeries({ color: '#6b7280', lineWidth: 1, title: 'BB Mid' });
      var bbLow = chart.addLineSeries({ color: '#6b7280', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: 'BB Lower' });
      bbUp.setData(indicators.bb.upper.filter(function (d) { return d !== null; }));
      bbMid.setData(indicators.bb.middle.filter(function (d) { return d !== null; }));
      bbLow.setData(indicators.bb.lower.filter(function (d) { return d !== null; }));
    }
    if (indicators && indicators.volume) {
      var volSeries = chart.addHistogramSeries({ color: '#3b82f6', priceFormat: { type: 'volume' }, priceScaleId: '' });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volSeries.setData(indicators.volume);
    }
    if (indicators && indicators.sr) {
      var sr = indicators.sr;
      var ts = data.map(function (d) { return d.time; });
      if (sr.supports && sr.supports.length) {
        sr.supports.slice(0, 3).forEach(function (s) {
          var line = chart.addLineSeries({ color: '#22c55e', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: 'S ' + s.level.toFixed(0) });
          line.setData(ts.map(function (t) { return { time: t, value: s.level }; }));
        });
      }
      if (sr.resistances && sr.resistances.length) {
        sr.resistances.slice(0, 3).forEach(function (r) {
          var line = chart.addLineSeries({ color: '#ef4444', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: 'R ' + r.level.toFixed(0) });
          line.setData(ts.map(function (t) { return { time: t, value: r.level }; }));
        });
      }
    }
    if (indicators && indicators.fib) {
      var fib = indicators.fib;
      var ts = data.map(function (d) { return d.time; });
      var fibColors = { '0%': '#22c55e', '23.6%': '#3b82f6', '38.2%': '#8b5cf6', '50%': '#f59e0b', '61.8%': '#ef4444', '78.6%': '#ec4899', '100%': '#ef4444' };
      fib.levels.forEach(function (f) {
        if (f.label === '0%' || f.label === '100%') return;
        var color = fibColors[f.label] || '#6b7280';
        var line = chart.addLineSeries({ color: color, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, title: 'Fib ' + f.label });
        line.setData(ts.map(function (t) { return { time: t, value: f.value }; }));
      });
    }
    if (indicators && indicators.pivots) {
      var piv = indicators.pivots;
      var ts = data.map(function (d) { return d.time; });
      var ppLine = chart.addLineSeries({ color: '#ffffff', lineWidth: 2, title: 'PP' });
      ppLine.setData(ts.map(function (t) { return { time: t, value: piv.PP }; }));
    }
    chart.timeScale().fitContent();
    var ro = new ResizeObserver(function () { chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }); });
    ro.observe(container);
    _chartRefs[container] = { chart: chart, ro: ro };
    return { chart: chart, candle: candleSeries };
  }

  function renderEquityCurve(container, equityCurve, title) {
    destroyChart(container);
    container.innerHTML = '';
    if (!window.LightweightCharts) {
      container.innerHTML = '<p style="color:#999;padding:20px">Chart library tidak tersedia.</p>';
      return;
    }
    if (!equityCurve || !equityCurve.length) {
      container.innerHTML = '<p style="color:#999;padding:20px">Equity curve kosong.</p>';
      return;
    }
    var chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 300,
      layout: { background: { type: 'solid', color: '#1a1a2e' }, textColor: '#a0a0b0' },
      grid: { vertLines: { color: '#2a2a3e' }, horzLines: { color: '#2a2a3e' } },
      timeScale: { timeVisible: false, secondsVisible: false },
      rightPriceScale: { borderColor: '#2a2a3e' }
    });
    _chartRefs[container] = chart;
    var series = chart.addLineSeries({
      color: '#22c55e', lineWidth: 2, title: title || 'Equity',
      priceFormat: { type: 'price', precision: 2 }
    });
    series.setData(equityCurve.map(function (p) { return { time: p.t, value: p.v }; }));
    var baseline = equityCurve[0] ? equityCurve[0].v : 0;
    chart.priceScale('right').applyOptions({ autoScale: true });
    return { chart: chart, series: series, baseline: baseline };
  }

  CC.ta = {
    SYM: SYM,
    resolveSymbol: resolveSymbol,
    fetchYahoo: fetchYahoo,
    calcSMA: calcSMA,
    calcEMA: calcEMA,
    calcRSI: calcRSI,
    calcMACD: calcMACD,
    calcBollinger: calcBollinger,
    calcATR: calcATR,
    calcStochastic: calcStochastic,
    calcVWAP: calcVWAP,
    calcIchimoku: calcIchimoku,
    detectPatterns: detectPatterns,
    detectSwingPoints: detectSwingPoints,
    detectSR: detectSR,
    calcFibonacci: calcFibonacci,
    calcPivots: calcPivots,
    detectOrderBlocks: detectOrderBlocks,
    detectBOS: detectBOS,
    detectChoCH: detectChoCH,
    detectFVG: detectFVG,
    detectLiquidity: detectLiquidity,
    calcPremiumDiscount: calcPremiumDiscount,
    detectHarmonic: detectHarmonic,
    detectElliottWave: detectElliottWave,
    multiTFAnalysis: multiTFAnalysis,
    calcVolumeProfile: calcVolumeProfile,
    detectMarketStructure: detectMarketStructure,
    calcCorrelation: calcCorrelation,
    calcRiskManagement: calcRiskManagement,
    scoreSignals: scoreSignals,
    getCurrentSession: getCurrentSession,
    fetchMultiTF: fetchMultiTF,
    fetchCorrelation: fetchCorrelation,
    fetchStooq: fetchStooq,
    fetchWithFallback: fetchWithFallback,
    validateData: validateData,
    calcSwingPoints: calcSwingPoints,
    backtest: backtest,
    genSignals: genSignals,
    formatBacktest: formatBacktest,
    formatConfluence: formatConfluence,
    scoreNewsSentiment: scoreNewsSentiment,
    fetchNewsSentiment: fetchNewsSentiment,
    formatNewsSentiment: formatNewsSentiment,
    sentimentFriendly: sentimentFriendly,
    addAlert: addAlert,
    removeAlert: removeAlert,
    clearAlerts: clearAlerts,
    listAlerts: listAlerts,
    checkAlerts: checkAlerts,
    formatAlerts: formatAlerts,
    analyze: analyze,
    renderChart: renderChart,
    renderEquityCurve: renderEquityCurve,
    destroyChart: destroyChart
  };
})();
