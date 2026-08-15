/* cangcilung — Asisten AI gratis
 * Chat murni: satu tab, kirim pesan, dapat jawaban streaming.
 * Backend OpenAI-compatible /v1/chat/completions: OpenRouter (cloud, gratis) atau server lokal.
 */

(function () {
  'use strict';

  var SYSTEM = [
    'Kamu adalah cangcilung, asisten AI dewasa yang ramah, terus terang, dan sangat membantu.',
    'Jawab dalam bahasa Indonesia yang natural dan sopan.',
    'Prinsip menjawab:',
    '1. AKURAT dulu, baru lengkap. Jangan menebak; jika tidak yakin, katakan tidak yakin.',
    '2. Untuk hitungan/analisis/masalah bertahap, tunjukkan langkahnya secara ringkas dan rapi (pakai bullet/angka).',
    '3. Untuk pertanyaan singkat, jawab singkat. Untuk pertanyaan kompleks, jawab terstruktur (poin, tabel, kode bila perlu).',
    '4. Jika diminta kode, berikan kode lengkap yang bisa langsung dipakai + penjelasan singkat.',
    '5. Jangan mengulang pertanyaan user. Langsung ke inti jawaban.',
    '6. Bahasa: gunakan Indonesia; istilah teknis boleh bahasa Inggris jika lebih tepat.'
  ].join(' ');
  var PERSONAS = {
    default: '',
    guru: '\nGaya kamu sekarang: GURU. Jelaskan konsep dengan sabar dan runtut, gunakan analogi sederhana, dan akhiri dengan pertanyaan latihan kecil atau rangkuman. Bersemangat mengajar.',
    teman: '\nGaya kamu sekarang: TEMAN. Jawab dengan santai, akrab, dan hangat seperti teman dekat. Boleh pakai bahasa gaul ringan dan emoji, tetap akurat.',
    bos: '\nGaya kamu sekarang: BOS. Jawab singkat, langsung ke poin, tegas, tanpa basa-basi. Beri keputusan/rekomendasi yang jelas.',
    kode: '\nGaya kamu sekarang: SPESIALIS KODE. Fokus pada solusi teknis yang efisien dan benar. Berikan kode bersih dengan penjelasan singkat. Prioritaskan kualitas kode dan praktik terbaik.'
  };
  var DEFAULT_BASE = 'https://api.groq.com/openai/v1';
  var DEFAULT_MODEL = 'llama-3.3-70b-versatile';
  var VISION_MODEL = 'qwen/qwen3.6-27b';
  var FALLBACKS = [
    'openai/gpt-oss-120b',
    'qwen/qwen3.6-27b',
    'openai/gpt-oss-20b'
  ];
  var HISTORY_KEY = 'cangcilung_history';
  var SETTINGS_KEY = 'cangcilung_settings';
  var SUMMARY_KEY = 'cangcilung_summary';
  var USAGE_KEY = 'cangcilung_usage';
  var SESSIONS_KEY = 'cangcilung_sessions';

  var els = {};
  var history = [];
  var summary = '';
  var settings = { baseUrl: '', model: DEFAULT_MODEL, apiKey: '', analyModel: '', persona: 'default', verifyEnabled: true };
  var busy = false;
  var abortCtrl = null;

  function $(id) { return document.getElementById(id); }

  function loadSummary() {
    try {
      var s = currentSession();
      if (s) { summary = s.summary || ''; return; }
      summary = localStorage.getItem(SUMMARY_KEY) || '';
    } catch (e) {}
  }

  function saveSummary() {
    try {
      localStorage.setItem(SUMMARY_KEY, summary);
      var s = currentSession();
      if (s) { s.summary = summary; saveSessions(); }
    } catch (e) {}
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        settings.baseUrl = s.baseUrl || '';
        settings.model = s.model || DEFAULT_MODEL;
        settings.apiKey = s.apiKey || '';
        settings.analyModel = s.analyModel || '';
        settings.persona = s.persona || 'default';
        settings.verifyEnabled = s.verifyEnabled !== false;
      }
    } catch (e) {}
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  var sessions = [];
  var currentSessionId = null;

  function loadSessions() {
    try {
      var raw = JSON.parse(localStorage.getItem(SESSIONS_KEY) || 'null');
      if (Array.isArray(raw) && raw.length) {
        sessions = raw;
        currentSessionId = sessions[0].id;
        return;
      }
    } catch (e) {}
    sessions = [{ id: 's1', name: 'Percakapan 1', history: [], summary: '' }];
    currentSessionId = 's1';
    try {
      var legacy = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(legacy) && legacy.length) sessions[0].history = legacy.slice(-200);
      var legacySum = localStorage.getItem(SUMMARY_KEY) || '';
      if (legacySum) sessions[0].summary = legacySum;
    } catch (e) {}
    saveSessions();
  }

  function saveSessions() {
    try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch (e) {}
  }

  function currentSession() {
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === currentSessionId) return sessions[i];
    }
    return sessions[0];
  }

  function newSession() {
    var n = sessions.length + 1;
    var id = 's' + Date.now();
    sessions.push({ id: id, name: 'Percakapan ' + n, history: [], summary: '' });
    currentSessionId = id;
    saveSessions();
    history = [];
    summary = '';
    saveHistory();
    saveSummary();
    renderHistory();
    connSub();
    closeSessions();
    return id;
  }

  function selectSession(id) {
    currentSessionId = id;
    saveSessions();
    history = [];
    summary = '';
    var s = currentSession();
    if (s) { history = s.history.slice(); summary = s.summary || ''; }
    clearAttachment();
    clearImage();
    renderHistory();
    connSub();
    closeSessions();
  }

  function deleteSession(id) {
    if (sessions.length <= 1) { setStatus('Minimal satu percakapan harus ada.', true); return; }
    sessions = sessions.filter(function (s) { return s.id !== id; });
    if (currentSessionId === id) currentSessionId = sessions[0].id;
    saveSessions();
    history = [];
    summary = '';
    var s = currentSession();
    if (s) { history = s.history.slice(); summary = s.summary || ''; }
    renderHistory();
    connSub();
    renderSessionList();
  }

  function renameSession(id) {
    var s = null;
    for (var i = 0; i < sessions.length; i++) if (sessions[i].id === id) s = sessions[i];
    if (!s) return;
    var name = prompt('Nama percakapan:', s.name);
    if (name && name.trim()) { s.name = name.trim(); saveSessions(); renderSessionList(); }
  }

  function renderSessionList() {
    var box = $('session-list');
    if (!box) return;
    box.innerHTML = '';
    sessions.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'session-row' + (s.id === currentSessionId ? ' active' : '');
      var label = document.createElement('span');
      label.className = 'session-name';
      label.textContent = s.name;
      label.title = s.history.length + ' pesan';
      label.addEventListener('click', function () { selectSession(s.id); });
      var rename = document.createElement('button');
      rename.className = 'session-act';
      rename.textContent = '✏️';
      rename.title = 'Ganti nama';
      rename.addEventListener('click', function () { renameSession(s.id); });
      var del = document.createElement('button');
      del.className = 'session-act';
      del.textContent = '🗑️';
      del.title = 'Hapus';
      del.addEventListener('click', function () {
        if (confirm('Hapus percakapan "' + s.name + '"?')) deleteSession(s.id);
      });
      row.appendChild(label);
      row.appendChild(rename);
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function openSessions() {
    renderSessionList();
    $('sessions-modal').hidden = false;
  }

  function closeSessions() {
    var m = $('sessions-modal');
    if (m) m.hidden = true;
  }

  function loadHistory() {
    try {
      var s = currentSession();
      if (s) { history = s.history.slice(); return; }
      var raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) history = arr.slice(-200);
      }
    } catch (e) {}
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-200)));
      var s = currentSession();
      if (s) { s.history = history.slice(-200); saveSessions(); }
    } catch (e) {}
  }

  var summarizing = false;
  var attachedFile = null;
  var attachedImage = null;
  function summarizeOld() {
    if (summarizing) return;
    if (history.length < 40) return;
    var keep = history.slice(-20);
    var old = history.slice(0, history.length - 20);
    if (old.length < 20) return;
    summarizing = true;
    fetch(apiUrl('/chat/completions'), {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        max_tokens: 400,
        messages: [{
          role: 'system',
          content: 'Kamu adalah pencatat ringkasan. Ringkas percakapan berikut dalam bahasa Indonesia, maksimal 250 kata, dalam bentuk poin-poin penting (topik, keputusan, fakta yang disebutkan user). Hanya hasil ringkasan, tanpa pembuka.'
        }, {
          role: 'user',
          content: old.map(function (m) { return m.role + ': ' + m.content; }).join('\n').slice(-6000)
        }]
      })
    })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)); })
      .then(function (j) {
        var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
        if (txt) {
          summary = (summary ? summary + '\n' : '') + txt;
          if (summary.length > 3000) summary = txt;
          saveSummary();
        }
        history = keep;
        saveHistory();
        renderHistory();
      })
      .catch(function () {})
      .finally(function () { summarizing = false; });
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Gagal membaca file.')); };
      r.readAsText(file);
    });
  }

  function parsePdf(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var typed = new Uint8Array(r.result);
          var task = window.pdfjsLib.getDocument({ data: typed });
          task.promise.then(function (doc) {
            var pages = [];
            var chain = Promise.resolve();
            for (var i = 1; i <= doc.numPages; i++) {
              (function (pageNum) {
                chain = chain.then(function () {
                  return doc.getPage(pageNum).then(function (page) {
                    return page.getTextContent().then(function (tc) {
                      var line = tc.items.map(function (it) { return it.str || ''; }).join(' ');
                      pages.push('-- Halaman ' + pageNum + ' --\n' + line);
                    });
                  });
                });
              })(i);
            }
            chain.then(function () { resolve(pages.join('\n')); }, reject);
          }, reject);
        } catch (e) { reject(new Error('PDF tidak valid: ' + e.message)); }
      };
      r.onerror = function () { reject(new Error('Gagal membaca PDF.')); };
      r.readAsArrayBuffer(file);
    });
  }

  function parseFile(file) {
    var name = (file.name || '').toLowerCase();
    if (/\.(txt|md|markdown|csv|json|log)$/i.test(name)) {
      return readFileAsText(file);
    }
    if (/\.pdf$/i.test(name)) {
      return parsePdf(file);
    }
    if (/\.(xlsx|xls)$/i.test(name)) {
      return parseXlsx(file);
    }
    if (/\.docx$/i.test(name)) {
      return parseDocx(file);
    }
    return Promise.reject(new Error('Jenis file tidak didukung. Gunakan .txt, .md, .csv, .json, .log, .pdf, .xlsx, atau .docx.'));
  }

  function parseXlsx(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        try {
          if (typeof XLSX === 'undefined') return reject(new Error('Library Excel belum termuat. Cek koneksi internet.'));
          var wb = XLSX.read(r.result, { type: 'array' });
          if (!wb || !wb.SheetNames || !wb.SheetNames.length) return reject(new Error('File Excel kosong atau tidak valid.'));
          var out = [];
          wb.SheetNames.forEach(function (sheetName) {
            var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
            out.push('-- Sheet: ' + sheetName + ' --');
            rows.slice(0, 300).forEach(function (row) {
              var cells = (row || []).map(function (c) { return c === '' || c == null ? '' : String(c); });
              out.push(cells.join(' | '));
            });
          });
          var result = out.join('\n');
          if (!result.trim()) return reject(new Error('File Excel kosong.'));
          resolve(result);
        } catch (e) { reject(new Error('File Excel tidak valid: ' + e.message)); }
      };
      r.onerror = function () { reject(new Error('Gagal membaca Excel.')); };
      r.readAsArrayBuffer(file);
    });
  }

  function parseDocx(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        try {
          if (typeof mammoth === 'undefined') return reject(new Error('Library Word belum termuat. Cek koneksi internet.'));
          mammoth.extractRawText({ arrayBuffer: r.result }).then(function (res) {
            var result = (res.value || '').trim();
            if (!result) return reject(new Error('File Word kosong atau tanpa teks.'));
            resolve(result);
          }, reject);
        } catch (e) { reject(new Error('File Word tidak valid: ' + e.message)); }
      };
      r.onerror = function () { reject(new Error('Gagal membaca Word.')); };
      r.readAsArrayBuffer(file);
    });
  }

  function attachFile(file) {
    setStatus('Membaca ' + file.name + '...');
    parseFile(file).then(function (text) {
      attachedFile = { name: file.name, text: text };
      var elName = $('attach-name');
      var elChip = $('attach-chip');
      if (elName) elName.textContent = '📎 ' + file.name + ' (' + (text.length / 1000).toFixed(1) + ' KB)';
      if (elChip) elChip.hidden = false;
      setStatus('File siap. Ketik pertanyaan lalu kirim.');
    }).catch(function (err) {
      setStatus('Error: ' + err.message, true);
    });
  }

  function clearAttachment() {
    attachedFile = null;
    var elChip = $('attach-chip');
    if (elChip) elChip.hidden = true;
  }

  function baseUrl() {
    var b = settings.baseUrl.replace(/\/+$/, '');
    return b || DEFAULT_BASE;
  }

  function apiUrl(path) {
    var b = baseUrl();
    if (path === '/api/tags') return b + '/api/tags';
    if (/\/v1$/.test(b)) return b + path;
    return b + '/v1' + path;
  }

  function apiHeaders() {
    var h = { 'Content-Type': 'application/json' };
    if (settings.apiKey) h.Authorization = 'Bearer ' + settings.apiKey;
    if (/openrouter\.ai/i.test(baseUrl())) {
      h['HTTP-Referer'] = window.location.origin;
      h['X-Title'] = 'cangcilung';
    }
    return h;
  }

  function connSub() {
    var el = $('conn-sub');
    if (!el) return;
    var where = settings.model
      ? settings.model
      : (baseUrl() || DEFAULT_BASE);
    el.textContent = settings.model
      ? 'Model: ' + settings.model
      : 'Base: ' + where;
  }

  function setStatus(msg, isError) {
    var el = $('chat-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'chat-status' + (isError ? ' error' : '');
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

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

  function getSystem() {
    return SYSTEM + (PERSONAS[settings.persona] || '');
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
      btn.addEventListener('click', function () {
        runCode(code.textContent, pre);
      });
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

  function exportChat() {
    var s = currentSession();
    var lines = [];
    lines.push('# cangcilung — Ekspor Percakapan');
    lines.push('Nama: ' + (s ? s.name : '') + ' | Tanggal: ' + new Date().toLocaleString('id-ID'));
    lines.push('');
    if (summary) { lines.push('Ringkasan konteks:'); lines.push(summary); lines.push(''); }
    history.forEach(function (m) {
      lines.push('## ' + (m.role === 'user' ? '🧑 Anda' : '🤖 cangcilung'));
      lines.push(m.content);
      lines.push('');
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cangcilung-' + (s ? s.name.replace(/[^\w]+/g, '-').toLowerCase() : 'chat') + '.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
    setStatus('⬇️ Percakapan diekspor.');
  }

  function verifyAnswer(question, answer) {
    if (!settings.verifyEnabled) return;
    fetch(apiUrl('/chat/completions'), {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        model: settings.analyModel || settings.model,
        stream: false,
        max_tokens: 300,
        messages: [
          { role: 'system', content: 'Kamu adalah pemeriksa jawaban. Periksa kebenaran jawaban berikut terhadap pertanyaan. Jika jawaban SALAH (terutama perhitungan/logika), jawab dengan koreksi singkat. Jika BENAR, balas hanya dengan: OK' },
          { role: 'user', content: 'Pertanyaan: ' + question + '\n\nJawaban:\n' + String(answer).slice(0, 3000) }
        ]
      })
    })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)); })
      .then(function (j) {
        var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
        if (!txt) return;
        if (/^ok$/i.test(txt)) return;
        var note = document.createElement('div');
        note.className = 'msg-note verify-note';
        note.textContent = '🔎 Verifikasi: ' + txt.slice(0, 500);
        var box = $('chat-messages');
        if (box) box.appendChild(note);
        scrollChat();
      })
      .catch(function () {});
  }

  function addBubble(role, text) {
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (text != null) {
      if (role === 'user') bubble.textContent = text;
      else { bubble.classList.add('typing'); renderMarkdown(bubble, text || '…'); }
    }
    wrap.appendChild(bubble);
    $('chat-messages').appendChild(wrap);
    scrollChat();
    return bubble;
  }

  function scrollChat() {
    var m = $('chat-messages');
    if (m) m.scrollTop = m.scrollHeight;
  }

  function renderHistory() {
    var box = $('chat-messages');
    box.innerHTML = '';
    if (!history.length) {
      var welcome = document.createElement('div');
      welcome.className = 'welcome';
      welcome.innerHTML = '<div class="welcome-avatar">A</div><p>Halo, saya cangcilung. Tanya apa saja — saya siap membantu.</p>';
      box.appendChild(welcome);
      return;
    }
    history.forEach(function (m) {
      var b = addBubble(m.role, m.content);
      if (m.role === 'assistant') addRunButtons(b);
    });
  }

  function parseSSEChunk(chunk, buffer, onDelta, onDone) {
    buffer.text += chunk;
    var parts = buffer.text.split('\n\n');
    buffer.text = parts.pop() || '';
    parts.forEach(function (block) {
      var lines = block.split('\n');
      var data = '';
      lines.forEach(function (l) {
        if (l.slice(0, 6) === 'data: ') data += l.slice(6);
        else if (l === 'data:') data += '';
      });
      if (!data) return;
      if (data === '[DONE]') { onDone(); return; }
      try {
        var j = JSON.parse(data);
        var delta = j.choices && j.choices[0] && j.choices[0].delta;
        if (delta && delta.content) {
          var c = delta.content;
          if (buffer.thinking) {
            var closeIdx = c.indexOf('</think>');
            if (closeIdx !== -1) { c = c.slice(closeIdx + 8); buffer.thinking = false; }
            else c = '';
          }
          if (!buffer.thinking && c) {
            var openIdx = c.indexOf('<think>');
            if (openIdx !== -1) {
              c = c.slice(openIdx + 7);
              var endIdx = c.indexOf('</think>');
              if (endIdx !== -1) { c = c.slice(endIdx + 8); }
              else { buffer.thinking = true; c = ''; }
            }
          }
          if (c) onDelta(c);
        }
        if (j.choices && j.choices[0] && j.choices[0].finish_reason === 'stop') onDone();
      } catch (e) {}
    });
  }

  function parseImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var MAX = 1200;
          var scale = Math.min(1, MAX / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          var sizeKB = Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 3 / 4 / 1024);
          resolve({ dataUrl: dataUrl, width: w, height: h, sizeKB: sizeKB, name: file.name });
        };
        img.onerror = function () { reject(new Error('Gambar tidak dapat dibaca.')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('Gagal membaca gambar.')); };
      reader.readAsDataURL(file);
    });
  }

  function attachImage(file) {
    setStatus('Membaca gambar...');
    parseImage(file).then(function (img) {
      attachedImage = img;
      var elPreview = $('img-preview');
      var elChip = $('img-chip');
      var elName = $('img-name');
      if (elPreview) elPreview.src = img.dataUrl;
      if (elName) elName.textContent = '🖼️ ' + img.name + ' (' + img.width + '×' + img.height + ', ' + img.sizeKB + ' KB)';
      if (elChip) elChip.hidden = false;
      setStatus('Gambar siap. Ketik pertanyaan tentang gambar lalu kirim.');
    }).catch(function (err) {
      setStatus('Error: ' + err.message, true);
    });
  }

  function clearImage() {
    attachedImage = null;
    var elChip = $('img-chip');
    if (elChip) elChip.hidden = true;
  }

  function loadUsage() {
    try {
      var raw = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
      var today = new Date().toISOString().slice(0, 10);
      if (raw.date !== today) { raw = { date: today, requests: 0 }; localStorage.setItem(USAGE_KEY, JSON.stringify(raw)); }
      return raw;
    } catch (e) { return { date: '', requests: 0 }; }
  }

  function saveUsage(usage) {
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(usage)); } catch (e) {}
  }

  function trackUsage() {
    var u = loadUsage();
    u.requests++;
    saveUsage(u);
    renderUsage();
  }

  function renderUsage() {
    var el = $('usage-sub');
    if (!el) return;
    var u = loadUsage();
    el.textContent = u.requests ? '· ' + u.requests + ' permintaan hari ini' : '';
  }

  function toggleMic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatus('Voice input tidak didukung di browser ini. Gunakan Chrome/Brave/Edge.', true); return; }
    if (!recognition) {
      recognition = new SR();
      recognition.lang = 'id-ID';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = function (e) {
        var text = '';
        for (var i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        var input = $('chat-input');
        if (input) input.value = text;
      };
      recognition.onend = function () {
        listening = false;
        var btn = $('btn-mic');
        if (btn) btn.classList.remove('active');
        var input = $('chat-input');
        if (speakEnabled && input && input.value.trim()) {
          setStatus('🎤 Mengirim otomatis...');
          sendChat();
        }
      };
      recognition.onerror = function (e) {
        listening = false;
        var btn = $('btn-mic');
        if (btn) btn.classList.remove('active');
        setStatus('Mic error: ' + (e.error || 'unknown'), true);
      };
    }
    if (listening) { recognition.stop(); }
    else { recognition.start(); listening = true; var btn = $('btn-mic'); if (btn) btn.classList.add('active'); setStatus('🎤 Mendengarkan... bicaralah.'); }
  }

  var speakEnabled = false;
  var suggestEnabled = false;
  var recognition = null;
  var listening = false;

  function toggleSpeak() {
    speakEnabled = !speakEnabled;
    var btn = $('btn-speak');
    if (btn) btn.classList.toggle('active', speakEnabled);
    if (!speakEnabled && window.speechSynthesis) window.speechSynthesis.cancel();
    setStatus(speakEnabled ? '🔊 Jawaban akan dibacakan.' : 'Mode suara nonaktif.');
  }

  function speakText(text) {
    if (!speakEnabled || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      var clean = String(text).replace(/[#*`~>_|]/g, ' ').replace(/\s+/g, ' ').slice(0, 1500);
      var u = new SpeechSynthesisUtterance(clean);
      u.lang = 'id-ID';
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function toggleSuggest() {
    suggestEnabled = !suggestEnabled;
    var btn = $('btn-suggest');
    if (btn) btn.classList.toggle('active', suggestEnabled);
    setStatus(suggestEnabled ? '💡 Saran pertanyaan aktif.' : 'Mode saran nonaktif.');
  }

  var PERSONA_ORDER = ['default', 'guru', 'teman', 'bos', 'kode'];
  var PERSONA_EMOJI = { default: '✨', guru: '🎓', teman: '🤝', bos: '👔', kode: '💻' };
  var PERSONA_LABEL = { default: 'Seimbang', guru: 'Guru', teman: 'Teman', bos: 'Bos', kode: 'Kode' };

  function cyclePersona() {
    var idx = PERSONA_ORDER.indexOf(settings.persona);
    if (idx === -1) idx = 0;
    settings.persona = PERSONA_ORDER[(idx + 1) % PERSONA_ORDER.length];
    saveSettings();
    var btn = $('btn-persona');
    if (btn) {
      btn.textContent = PERSONA_EMOJI[settings.persona] || '🎭';
      btn.title = 'Gaya: ' + (PERSONA_LABEL[settings.persona] || settings.persona);
    }
    setStatus('🎭 Gaya cangcilung: ' + (PERSONA_LABEL[settings.persona] || settings.persona));
  }

  function renderSuggestions() {
    var box = $('chat-messages');
    if (!suggestions.length) return;
    var wrap = document.createElement('div');
    wrap.className = 'msg suggest';
    var label = document.createElement('div');
    label.className = 'msg-note';
    label.textContent = '💡 Mau tanya lanjutan?';
    wrap.appendChild(label);
    suggestions.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'suggest-chip';
      b.textContent = s;
      b.addEventListener('click', function () {
        var input = $('chat-input');
        if (input) { input.value = s; input.focus(); }
      });
      wrap.appendChild(b);
    });
    box.appendChild(wrap);
    scrollChat();
  }

  var suggestions = [];

  function loadSuggestions(model, question, answer) {
    if (!suggestEnabled) return;
    fetch(apiUrl('/chat/completions'), {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        model: model,
        stream: false,
        max_tokens: 120,
        messages: [{
          role: 'system',
          content: 'Kamu adalah pembuat saran pertanyaan. Berdasarkan pertanyaan dan jawaban berikut, buat 3 pertanyaan lanjutan yang menarik dalam bahasa Indonesia. Format: satu pertanyaan per baris, tanpa nomor, tanpa teks lain.'
        }, {
          role: 'user',
          content: 'Pertanyaan: ' + question + '\n\nJawaban: ' + String(answer).slice(0, 2000)
        }]
      })
    })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)); })
      .then(function (j) {
        var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
        suggestions = txt.split('\n').map(function (l) { return l.replace(/^[\d\-\*.]+\s*/, '').trim(); }).filter(function (l) { return l.length > 3; }).slice(0, 3);
        renderSuggestions();
      })
      .catch(function () {});
  }


  var webMode = false;
  var webFetching = false;

  function toggleWebMode() {
    webMode = !webMode;
    var btn = $('btn-web');
    var chip = $('web-chip');
    if (btn) btn.classList.toggle('active', webMode);
    if (chip) chip.hidden = !webMode;
    setStatus(webMode ? '🌐 Cari di web aktif — jawaban akan pakai info terkini.' : 'Mode web nonaktif.');
  }

  var WEB_RE = /\b(terkini|terbaru|berita|sekarang|hari ini|tahun \d{4}|cuaca|hasil pertandingan|skor|harga|jadwal|pemenang|presiden|gubernur|pemilu|kecelakaan|gempa|bencana|ramalan|prediksi|update|berapa harga)\b/i;

  function needsWeb(text) {
    return WEB_RE.test(text);
  }

  function searchWeb(query) {
    var q = encodeURIComponent(query.replace(/[?""''!]/g, ' ').slice(0, 200));
    var url = 'https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + q + '&format=json&origin=*&srlimit=3';
    return fetch(url, { signal: AbortSignal.timeout(10000) })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)); })
      .then(function (j) {
        var hits = (j.query && j.query.search) || [];
        var titles = hits.map(function (h) { return h.title; }).slice(0, 3);
        var chain = Promise.resolve();
        var out = [];
        titles.forEach(function (title) {
          chain = chain.then(function () {
            return fetch('https://id.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title), { signal: AbortSignal.timeout(10000) })
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (s) {
                if (s && s.extract) out.push('## ' + s.title + '\n' + s.extract.slice(0, 1200));
              })
              .catch(function () {});
          });
        });
        return chain.then(function () { return out.join('\n\n').slice(0, 6000); });
      });
  }

  var ANALYSIS_RE = /\b(hitung|hitunglah|jumlahkan|kalikan|bagikan|kurangkan|berapakah?|berapa (hasil|x|y|z)|rumus|persamaan|akar|logaritma|persen|konversi)\b|[-+*/^().]|[\d]+[.,][\d]+/i;
  var LOGIC_RE = /\b(logika|logical|analisa|analisis|bandingkan|bandingkanlah|buktikan|deriv|turunan|integral|persamaan|soal|case\b|debug|perbaiki kode|tulis kode|buatkan kode|pseudocode|algoritma)\b/i;

  function needsAnalysis(text) {
    if (LOGIC_RE.test(text)) return true;
    if (ANALYSIS_RE.test(text)) return true;
    return false;
  }

  function safeEval(expr) {
    expr = String(expr).replace(/[^\d+\-*/().^,%\s]/g, '');
    if (!/[\d]/.test(expr) || !/[-+*/^]/.test(expr)) return null;
    expr = expr.replace(/\s+/g, '').replace(/,/g, '.').replace(/\^/g, '**');
    try {
      var fn = new Function('return (' + expr + ')');
      var result = fn();
      if (typeof result !== 'number' || !isFinite(result)) return null;
      return result;
    } catch (e) { return null; }
  }

  function calcAnswer(text) {
    var trimmed = text.trim();
    if (/^[?]/.test(trimmed)) trimmed = trimmed.slice(1).trim();
    if (!/^\d/.test(trimmed) && !/^[(]/.test(trimmed)) return null;
    if (/\D{3,}/.test(trimmed)) return null;
    var result = safeEval(trimmed);
    if (result == null) return null;
    return 'Hasil hitung pasti (dihitung oleh kalkulator internal): ' + trimmed + ' = ' + result;
  }

  var STOPWORDS = ['yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'ini', 'itu', 'apa', 'bagaimana', 'berapa', 'apakah', 'kenapa', 'mengapa', 'saya', 'kamu', 'aku', 'mau', 'tolong', 'jelaskan', 'dalam', 'secara', 'akan', 'tidak', 'bisa', 'please'];

  function fileContextMessages() {
    if (!attachedFile) return [];
    var msg = [];
    var text = attachedFile.text;
    var CHUNK = 16000;
    if (text.length <= CHUNK) {
      msg.push({ role: 'user', content: 'Saya lampirkan isi file "' + attachedFile.name + '":\n\n' + text });
      return msg;
    }
    // RAG pintar: pecah jadi chunk kecil, pilih yang paling relevan dengan pertanyaan terakhir
    var question = history.length ? history[history.length - 1].content : '';
    var keywords = (question.toLowerCase().match(/[a-z0-9]{3,}/g) || [])
      .filter(function (w) { return STOPWORDS.indexOf(w) === -1; });
    var chunkSize = 3000;
    var chunks = [];
    for (var i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    if (keywords.length) {
      chunks.forEach(function (ch, idx) {
        var score = 0;
        keywords.forEach(function (k) {
          if (ch.toLowerCase().indexOf(k) !== -1) score++;
        });
        ch._score = score;
        ch._idx = idx;
      });
      chunks.sort(function (a, b) { return b._score - a._score || a._idx - b._idx; });
    }
    var budget = 20000;
    var used = 0;
    var picked = [];
    chunks.forEach(function (ch) {
      if (used + ch.length > budget) return;
      picked.push(ch);
      used += ch.length;
    });
    if (!picked.length) picked = [chunks[0]];
    picked.sort(function (a, b) { return a._idx - b._idx; });
    msg.push({ role: 'user', content: 'Saya lampirkan isi file "' + attachedFile.name + '" (bagian relevan yang dipilih untuk pertanyaan ini):\n\n' + picked.join('\n---\n') });
    return msg;
  }

  function sendChat() {
    if (busy) return;
    var input = $('chat-input');
    var text = input.value.trim();
    if (!text) return;
    if (!settings.model) {
      setStatus('Atur model dulu di ⚙️ Pengaturan.', true);
      openSettings();
      return;
    }

    busy = true;
    input.value = '';
    $('btn-send').disabled = true;
    setStatus('Menghubungkan ke model...');

    history.push({ role: 'user', content: text });
    saveHistory();
    renderHistory();

    var bubble = addBubble('assistant', null);
    bubble.classList.add('typing');
    var full = '';
    var attempted = [];
    var webContext = '';
    var isAnalysis = needsAnalysis(text);

    var calc = calcAnswer(text);
    if (calc) {
      history.push({ role: 'assistant', content: calc });
      saveHistory();
      bubble.classList.remove('typing');
      renderMarkdown(bubble, calc);
      renderHistory();
      busy = false;
      $('btn-send').disabled = false;
      setStatus('');
      return;
    }

    function addFallbackNote(name) {
      var note = document.createElement('div');
      note.className = 'msg-note';
      note.textContent = '→ otomatis pindah ke ' + name + ' (model sebelumnya sibuk/limit)';
      bubble.appendChild(note);
    }

    function attemptStream(model) {
      abortCtrl = new AbortController();
      attempted.push(model);
      var messages = [{ role: 'system', content: getSystem() }];
      if (summary) {
        messages.push({ role: 'system', content: 'Ringkasan percakapan sebelumnya:\n' + summary });
      }
      fileContextMessages().forEach(function (m) { messages.push(m); });
      if (attachedImage) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: 'Saya lampirkan gambar ini. Analisis dan jawab pertanyaan saya tentang gambar tersebut.' },
            { type: 'image_url', image_url: { url: attachedImage.dataUrl } }
          ]
        });
      }
      if (webContext) {
        messages.push({ role: 'system', content: 'Info terkini dari Wikipedia (pakai ini bila relevan untuk jawaban akurat):\n' + webContext });
      }
      messages = messages.concat(history);
      var body = {
        model: model,
        stream: true,
        messages: messages
      };

      return fetch(apiUrl('/chat/completions'), {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(body),
        signal: abortCtrl.signal
      })
        .then(function (res) {
          if (!res.ok) {
            return res.text().then(function (t) {
              var msg = 'HTTP ' + res.status;
              try {
                var j = JSON.parse(t);
                if (j.error && j.error.message) msg += ' — ' + j.error.message;
              } catch (e) {}
              if (msg === 'HTTP ' + res.status && t) msg += ' — ' + t.slice(0, 200);
              var err = new Error(msg);
              err.status = res.status;
              throw err;
            });
          }
          if (!res.body) throw new Error('Streaming tidak didukung di browser ini.');
          var reader = res.body.getReader();
          var decoder = new TextDecoder();
          var buffer = { text: '', thinking: false };
          var done = false;
          var finish = function () {
            if (done) return;
            done = true;
            bubble.classList.remove('typing');
            history.push({ role: 'assistant', content: full });
            saveHistory();
            renderHistory();
            busy = false;
            $('btn-send').disabled = false;
            setStatus('');
            trackUsage();
            speakText(full);
            if (isAnalysis) verifyAnswer(text, full);
            loadSuggestions(model, text, full);
            summarizeOld();
          };
          function pump() {
            return reader.read().then(function (r) {
              if (r.done) { finish(); return; }
              var chunk = decoder.decode(r.value, { stream: true });
              parseSSEChunk(chunk, buffer, function (d) {
                full += d;
                renderMarkdown(bubble, full);
                scrollChat();
              }, finish);
              return pump();
            });
          }
          return pump();
        });
    }

    function fail(err) {
      if (err && err.name === 'AbortError') {
        bubble.classList.remove('typing');
        busy = false;
        $('btn-send').disabled = false;
        setStatus('');
        return;
      }
      bubble.classList.remove('typing');
      if (full) renderMarkdown(bubble, full);
      else renderMarkdown(bubble, '⚠️ ' + (err && err.message ? err.message : 'Gagal menghubungi model.'));
      setStatus('Error: ' + (err && err.message ? err.message : err) + '. Cek Base URL, API key, dan koneksi internet.', true);
      busy = false;
      $('btn-send').disabled = false;
    }

    var pool = [];
    if (attachedImage) pool.push(VISION_MODEL);
    if (isAnalysis && settings.analyModel) pool.push(settings.analyModel);
    if (pool.indexOf(settings.model) === -1) pool.push(settings.model);
    FALLBACKS.forEach(function (f) { if (pool.indexOf(f) === -1) pool.push(f); });

    function next() {
      var model = pool.shift();
      if (!model) return fail(new Error('Semua model gagal.'));
      if ((webMode || needsWeb(text)) && !webContext && !webFetching) {
        webFetching = true;
        setStatus('🌐 Mencari info di web...');
        searchWeb(text).then(function (ctx) {
          webContext = ctx;
          if (!ctx) setStatus('Mode web: tidak ada hasil, lanjut jawab biasa.');
        }).catch(function () {
          setStatus('Mode web: gagal mencari, lanjut jawab biasa.');
        }).finally(function () {
          webFetching = false;
          next();
        });
        return;
      }
      attemptStream(model)
        .catch(function (err) {
          if (err && err.name === 'AbortError') return fail(err);
          if (full) return fail(err);
          var retryable = !err.status || err.status === 429 || err.status === 502 || err.status === 503 || err.status === 500;
          if (!retryable) return fail(err);
          if (!pool.length) return fail(err);
          if (model !== settings.model) addFallbackNote(model);
          setStatus('Model ' + model + ' sibuk, coba cadangan...');
          next();
        });
    }

    next();
  }

  function openSettings() {
    $('set-baseurl').value = settings.baseUrl;
    $('set-model').value = settings.model || DEFAULT_MODEL;
    $('set-model-analy').value = settings.analyModel || '';
    $('set-apikey').value = settings.apiKey || '';
    $('set-persona').value = settings.persona || 'default';
    $('set-status').textContent = '';
    $('settings-modal').hidden = false;
    $('set-baseurl').focus();
  }

  function closeSettings() {
    $('settings-modal').hidden = true;
  }

  function saveSettingsFromModal() {
    settings.baseUrl = $('set-baseurl').value.trim();
    settings.model = $('set-model').value.trim();
    settings.analyModel = $('set-model-analy').value.trim();
    settings.apiKey = $('set-apikey').value.trim();
    settings.persona = $('set-persona').value || 'default';
    saveSettings();
    syncPersonaButton();
    connSub();
    closeSettings();
    setStatus('Pengaturan disimpan.');
  }

  function syncPersonaButton() {
    var btn = $('btn-persona');
    if (btn) {
      btn.textContent = PERSONA_EMOJI[settings.persona] || '🎭';
      btn.title = 'Gaya: ' + (PERSONA_LABEL[settings.persona] || settings.persona);
    }
  }

  function testConnection() {
    var url = $('set-baseurl').value.trim().replace(/\/+$/, '') || DEFAULT_BASE;
    var key = $('set-apikey').value.trim();
    var st = $('set-status');
    st.textContent = 'Menguji koneksi...';
    st.className = 'set-status';
    function testHeaders() {
      var h = { 'Content-Type': 'application/json' };
      if (key) h.Authorization = 'Bearer ' + key;
      if (/openrouter\.ai/i.test(url)) {
        h['HTTP-Referer'] = window.location.origin;
        h['X-Title'] = 'cangcilung';
      }
      return h;
    }
    function probeModels(base) {
      return fetch((/\/v1$/.test(base) ? base : base + '/v1') + '/models', { signal: AbortSignal.timeout(10000), headers: testHeaders() })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (j) {
          var rows = j.data || [];
          return rows.map(function (m) { return m.id; });
        });
    }
    probeModels(url)
      .catch(function () {
        return fetch(url + '/api/tags', { signal: AbortSignal.timeout(10000) })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (j) {
            return (j.models || []).map(function (m) { return m.name; });
          });
      })
      .then(function (models) {
        st.textContent = 'Koneksi OK. Model tersedia: ' + (models.length ? models.join(', ') : 'tidak ada. Pull/pilih model di server Anda dulu.');
        st.className = 'set-status ok';
        if (!settings.model && models.length === 1) {
          $('set-model').value = models[0];
        }
      })
      .catch(function (err) {
        st.textContent = 'Gagal: ' + (err && err.message ? err.message : err);
        st.className = 'set-status error';
      });
  }

  function init() {
    loadSettings();
    loadSessions();
    loadHistory();
    loadSummary();
    els.btnSend = $('btn-send');
    els.chatInput = $('chat-input');
    els.chatMessages = $('chat-messages');
    connSub();
    renderHistory();
    renderUsage();
    syncPersonaButton();

    $('btn-send').addEventListener('click', sendChat);
    $('btn-attach').addEventListener('click', function () { $('file-input').click(); });
    $('file-input').addEventListener('change', function () {
      if (this.files && this.files[0]) {
        var f = this.files[0];
        if (/\.(png|jpe?g|webp|gif)$/i.test(f.name || '')) attachImage(f);
        else attachFile(f);
      }
      this.value = '';
    });
    $('btn-attach-clear').addEventListener('click', clearAttachment);
    $('btn-img-clear').addEventListener('click', clearImage);
    $('btn-web').addEventListener('click', toggleWebMode);
    $('btn-web-clear').addEventListener('click', toggleWebMode);
    $('btn-speak').addEventListener('click', toggleSpeak);
    $('btn-suggest').addEventListener('click', toggleSuggest);
    $('btn-mic').addEventListener('click', toggleMic);
    $('btn-sessions').addEventListener('click', openSessions);
    $('btn-sessions-close').addEventListener('click', closeSessions);
    $('btn-session-new').addEventListener('click', newSession);
    $('sessions-modal').addEventListener('click', function (e) {
      if (e.target === $('sessions-modal')) closeSessions();
    });
    $('btn-export').addEventListener('click', exportChat);
    $('btn-persona').addEventListener('click', cyclePersona);
    $('chat-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
    $('btn-clear-chat').addEventListener('click', function () {
      if (!busy && history.length && confirm('Hapus seluruh obrolan?')) {
        history = [];
        summary = '';
        clearAttachment();
        clearImage();
        saveHistory();
        saveSummary();
        renderHistory();
      }
    });
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-modal-close').addEventListener('click', closeSettings);
    $('btn-set-cancel').addEventListener('click', closeSettings);
    $('btn-set-save').addEventListener('click', saveSettingsFromModal);
    $('btn-set-test').addEventListener('click', testConnection);
    $('settings-modal').addEventListener('click', function (e) {
      if (e.target === $('settings-modal')) closeSettings();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
