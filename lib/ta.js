/* lib/ta.js — Technical Analysis (Yahoo Finance + TradingView Lightweight Charts) */
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});

  var SYM = { XAUUSD: 'GC=F', NDX: '^NDX', NASDAQ: '^IXIC', US30: '^DJI', SPX: '^GSPC' };
  var PROXIES = ['https://api.allorigins.win/raw?url=', 'https://corsproxy.io/?'];
  var INTERVAL_MAP = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '1d': '1d', '1w': '1wk', '1M': '1mo' };
  var PERIOD_MAP = { '1m': 7, '5m': 60, '15m': 60, '30m': 60, '1h': 730, '1d': 1825, '1w': 1825, '1M': 1825 };

  function resolveSymbol(input) {
    var up = (input || '').toUpperCase().trim();
    if (SYM[up]) return SYM[up];
    if (/^(XAU|GOLD|EMAS)/.test(up)) return 'GC=F';
    if (/^(NDX|NASDAQ|US.*TECH)/.test(up)) return '^NDX';
    if (/^(DJI|DOW|US30)/.test(up)) return '^DJI';
    if (/^(SPX|S\&P)/.test(up)) return '^GSPC';
    return up;
  }

  function fetchYahoo(symbol, interval, range) {
    var sym = resolveSymbol(symbol);
    var iv = INTERVAL_MAP[interval] || '1d';
    var period = PERIOD_MAP[iv] || 365;
    var now = Math.floor(Date.now() / 1000);
    var p1 = now - period * 86400;
    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=' + iv + '&period1=' + p1 + '&period2=' + now + '&includePrePost=false';
    var tryIdx = 0;
    function attempt() {
      var proxy = PROXIES[tryIdx % PROXIES.length];
      return fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(12000) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
        .then(function (j) {
          var result = j.chart && j.chart.result && j.chart.result[0];
          if (!result) throw new Error('Data tidak ditemukan untuk ' + sym);
          var ts = result.timestamp || [];
          var q = result.indicators && result.indicators.quote && result.indicators.quote[0];
          if (!q || !ts.length) throw new Error('Data kosong untuk ' + sym);
          var data = [];
          for (var i = 0; i < ts.length; i++) {
            if (q.open[i] != null && q.close[i] != null) {
              data.push({
                time: ts[i],
                open: q.open[i],
                high: q.high[i],
                low: q.low[i],
                close: q.close[i],
                volume: q.volume ? q.volume[i] || 0 : 0
              });
            }
          }
          if (!data.length) throw new Error('Data valid kosong');
          return { symbol: sym, name: result.meta && result.meta.shortName || sym, interval: iv, data: data };
        })
        .catch(function (err) {
          tryIdx++;
          if (tryIdx < PROXIES.length * 2) return attempt();
          throw err;
        });
    }
    return attempt();
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

  function multiTFAnalysis(dataDaily, dataHourly) {
    var daily = { trend: 'sideways', strength: 0 };
    var hourly = { trend: 'sideways', strength: 0 };
    function assessTrend(d) {
      if (d.length < 50) return { trend: 'sideways', strength: 0 };
      var ema20 = calcEMA(d, 20);
      var ema50 = calcEMA(d, 50);
      var last20 = ema20.filter(function (e) { return e !== null; }).slice(-1)[0];
      var last50 = ema50.filter(function (e) { return e !== null; }).slice(-1)[0];
      if (!last20 || !last50) return { trend: 'sideways', strength: 0 };
      var diff = (last20.value - last50.value) / last50.value * 100;
      if (Math.abs(diff) < 0.2) return { trend: 'sideways', strength: 0 };
      return { trend: diff > 0 ? 'bullish' : 'bearish', strength: Math.min(Math.abs(diff), 5) };
    }
    daily = assessTrend(dataDaily);
    hourly = assessTrend(dataHourly);
    var confluence = daily.trend === hourly.trend ? 'CONFLUENT' : 'DIVERGENT';
    return { daily: daily, hourly: hourly, confluence: confluence };
  }

  function detectOrderBlocks(data) {
    var obs = [];
    for (var i = 2; i < data.length; i++) {
      var c0 = data[i - 2], c1 = data[i - 1], c2 = data[i];
      var body0 = Math.abs(c0.close - c0.open);
      var body2 = Math.abs(c2.close - c2.open);
      var move = Math.abs(c2.close - c1.close);
      if (c0.close > c0.open && c2.close < c2.open && body2 > body0 * 1.5 && move > body0) {
        obs.push({ time: c0.time, type: 'bearish_ob', high: Math.max(c0.open, c0.close), low: Math.min(c0.open, c0.close), index: i - 2 });
      }
      if (c0.close < c0.open && c2.close > c2.open && body2 > body0 * 1.5 && move > body0) {
        obs.push({ time: c0.time, type: 'bullish_ob', high: Math.max(c0.open, c0.close), low: Math.min(c0.open, c0.close), index: i - 2 });
      }
    }
    return obs.slice(-10);
  }

  function detectBOS(data) {
    var lookback = 5;
    var events = [];
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
        var abRatio = AB / XA;
        var bcRatio = BC / AB;
        var cdRatio = CD / BC;
        var xdRatio = XD / XA;
        var tolerance = 0.08;
        var harmonicPatterns = [
          { name: 'Gartley', ab: 0.618, bc: 0.382, cd: 0.886, xd: 0.786 },
          { name: 'Butterfly', ab: 0.786, bc: 0.382, cd: 1.618, xd: 1.27 },
          { name: 'Bat', ab: 0.382, bc: 0.382, cd: 1.618, xd: 0.886 },
          { name: 'Crab', ab: 0.382, bc: 0.886, cd: 1.618, xd: 1.618 },
          { name: 'Cipher', ab: 0.5, bc: 0.618, cd: 1.27, xd: 0.786 }
        ];
        harmonicPatterns.forEach(function (hp) {
          if (Math.abs(abRatio - hp.ab) < tolerance && Math.abs(bcRatio - hp.bc) < tolerance &&
              Math.abs(cdRatio - hp.cd) < tolerance && Math.abs(xdRatio - hp.xd) < tolerance) {
            var bullish = D.type === 'L';
            patterns.push({ time: recent[D.idx].time, name: hp.name, bullish: bullish, X: X, A: A, B: B, C: C, D: D });
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
    var wave = last5.map(function (p, i) { return { wave: i + 1, price: p.price, type: p.type }; });
    return { direction: direction, waves: wave, currentWave: 5, label: 'Impulse ' + (direction === 'bullish' ? '5-wave UP' : '5-wave DOWN') };
  }

  function analyze(data) {
    var last = data[data.length - 1];
    var prev = data[data.length - 2];
    var rsi = calcRSI(data, 14);
    var macd = calcMACD(data);
    var bb = calcBollinger(data, 20, 2);
    var ema20 = calcEMA(data, 20);
    var ema50 = calcEMA(data, 50);
    var sma200 = calcSMA(data, 200);
    var atr = calcATR(data, 14);
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
      harmonics.forEach(function (h) { signals.push('Harmonic: ' + h.name + ' ' + (h.bullish ? 'BULLISH 🟢' : 'BEARISH 🔴')); });
    }
    if (elliott) signals.push('Elliott Wave: ' + elliott.label);
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
    if (obs.length) summary += '- **Order Blocks:** ' + obs.slice(-3).map(function (o) { return o.type.replace('_', ' ') + ' ' + o.low.toFixed(2) + '-' + o.high.toFixed(2); }).join(' | ') + '\n';
    if (fvg.length) summary += '- **FVG:** ' + fvg.map(function (f) { return f.type.replace('_', ' ') + ' ' + f.bottom.toFixed(2) + '-' + f.top.toFixed(2); }).join(' | ') + '\n';
    if (liq.length) summary += '- **Liquidity:** ' + liq.slice(-3).map(function (l) { return l.type.replace('_', ' ') + ' @ ' + l.price.toFixed(2) + ' (' + l.touches + 'x)'; }).join(' | ') + '\n';
    if (harmonics.length) summary += '- **Harmonic:** ' + harmonics.map(function (h) { return h.name + ' ' + (h.bullish ? 'BULL' : 'BEAR'); }).join(', ') + '\n';
    if (elliott) summary += '- **Elliott Wave:** ' + elliott.label + '\n';
    summary += '\n### Patterns\n' + patternText + '\n\n';
    summary += '### Signal\n';
    signals.forEach(function (s) { summary += '- ' + s + '\n'; });
    return summary;
  }

  function renderChart(container, data, indicators, title) {
    if (!window.LightweightCharts) {
      container.innerHTML = '<p style="color:#999;padding:20px">Chart library tidak tersedia.</p>';
      return;
    }
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
    return { chart: chart, candle: candleSeries };
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
    analyze: analyze,
    renderChart: renderChart
  };
})();
