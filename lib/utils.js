/* lib/utils.js — Pure utility functions for cangcilung */
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});

  function nowTime() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function $(id) { return document.getElementById(id); }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var ctx = this, args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; fn.apply(ctx, args); }, ms);
    };
  }

  function throttle(fn, ms) {
    var last = 0;
    return function () {
      var now = Date.now();
      if (now - last >= ms) { last = now; fn.apply(this, arguments); }
    };
  }

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function stripThinking(text) {
    if (!text) return '';
    return text.replace(/ thinking[\s\S]*?<\/think>/g, '').trim();
  }

  function compressHistory(history, maxPairs) {
    if (!history || history.length <= maxPairs * 2) return history;
    var recent = history.slice(-maxPairs * 2);
    var old = history.slice(0, -maxPairs * 2);
    var userMsgs = old.filter(function (m) { return m.role === 'user'; });
    var summary = '';
    if (userMsgs.length > 0) {
      var topics = [];
      var seen = {};
      userMsgs.forEach(function (m) {
        var words = (m.content || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(function (w) { return w.length > 4 && !seen[w]; });
        words.slice(0, 3).forEach(function (w) { seen[w] = true; topics.push(w); });
      });
      summary = 'Percakapan sebelumnya membahas: ' + topics.slice(0, 6).join(', ');
    }
    return [{ role: 'system', content: summary }].concat(recent);
  }

  CC.utils = {
    nowTime: nowTime,
    fallbackCopy: fallbackCopy,
    $: $,
    debounce: debounce,
    throttle: throttle,
    clamp: clamp,
    escapeHtml: escapeHtml,
    stripThinking: stripThinking,
    compressHistory: compressHistory
  };
})();
