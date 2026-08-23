/* lib/render.js — Pure rendering helpers for cangcilung
 * Functions: renderMarkdown, addRunButtons, runCode, showTyping, removeTyping
 * These have no state dependencies — only DOM APIs and global libraries.
 */
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});

  function renderMarkdown(el, text) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      try {
        var html = marked.parse(text || '');
        el.innerHTML = DOMPurify.sanitize(html);
        if (typeof hljs !== 'undefined') {
          el.querySelectorAll('pre code').forEach(function (b) {
            try { hljs.highlightElement(b); } catch (e) {}
          });
        }
        return;
      } catch (e) {}
    }
    el.textContent = text || '';
  }

  function addRunButtons(el) {
    if (!el) return;
    var blocks = el.querySelectorAll('pre code');
    blocks.forEach(function (code) {
      var lang = (code.className || '').match(/language-(\w+)/);
      var langName = lang ? lang[1] : '';
      var isJs = langName === 'js' || langName === 'javascript' || langName === 'node';
      if (!isJs) return;
      var pre = code.parentElement;
      if (!pre || pre.querySelector('.run-btn')) return;
      var btn = document.createElement('button');
      btn.className = 'run-btn';
      btn.textContent = '▶ Jalankan';
      btn.dataset.action = 'run';
      pre.appendChild(btn);
    });
  }

  function runCode(source, pre) {
    var out = pre.querySelector('.run-output');
    if (out) out.remove();
    out = document.createElement('div');
    out.className = 'run-output';
    out.textContent = '⏳ Menjalankan...';
    pre.appendChild(out);
    var workerCode = [
      'self.onmessage = function (e) {',
      '  var logs = [];',
      '  var origLog = console.log;',
      '  console.log = function () {',
      '    logs.push(Array.prototype.slice.call(arguments).join(" "));',
      '  };',
      '  try {',
      '    var result = (function() {',
      source,
      '    })();',
      '    if (result !== undefined) logs.push("=> " + JSON.stringify(result));',
      '    self.postMessage({ ok: true, logs: logs });',
      '  } catch (err) {',
      '    self.postMessage({ ok: false, logs: logs, error: String(err && err.message || err) });',
      '  }',
      '};'
    ].join('\n');
    var blob;
    try {
      blob = new Blob([workerCode], { type: 'application/javascript' });
    } catch (e) { out.textContent = 'Web Worker tidak didukung.'; return; }
    var url = URL.createObjectURL(blob);
    var worker = new Worker(url);
    var timer = setTimeout(function () {
      worker.terminate();
      URL.revokeObjectURL(url);
      out.textContent = '⏱️ Waktu habis (>5 detik).';
    }, 5000);
    worker.onmessage = function (e) {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      var parts = [];
      if (e.data.logs && e.data.logs.length) parts.push('📤 Output:\n' + e.data.logs.join('\n'));
      if (e.data.ok) {
        if (!parts.length) parts.push('✅ Berjalan tanpa output.');
      } else {
        parts.push('❌ Error: ' + e.data.error);
      }
      out.textContent = parts.join('\n\n');
    };
    worker.onerror = function (e) {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      out.textContent = '❌ Worker error: ' + e.message;
    };
    worker.postMessage('run');
  }

  function showTyping(bubble) {
    removeTyping(bubble);
    var wrap = document.createElement('div');
    wrap.className = 'typing-indicator';
    var i;
    for (i = 0; i < 3; i++) {
      var dot = document.createElement('span');
      dot.className = 'typing-dot';
      wrap.appendChild(dot);
    }
    bubble.appendChild(wrap);
  }

  function removeTyping(bubble) {
    var el = bubble.querySelector('.typing-indicator');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  CC.render = {
    renderMarkdown: renderMarkdown,
    addRunButtons: addRunButtons,
    runCode: runCode,
    showTyping: showTyping,
    removeTyping: removeTyping
  };
})();
