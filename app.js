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
  var DEFAULT_BASE = 'https://api.groq.com/openai/v1';
  var DEFAULT_MODEL = 'llama-3.3-70b-versatile';
  var FALLBACKS = [
    'openai/gpt-oss-120b',
    'qwen/qwen3.6-27b',
    'openai/gpt-oss-20b'
  ];
  var HISTORY_KEY = 'cangcilung_history';
  var SETTINGS_KEY = 'cangcilung_settings';
  var SUMMARY_KEY = 'cangcilung_summary';

  var els = {};
  var history = [];
  var summary = '';
  var settings = { baseUrl: '', model: DEFAULT_MODEL, apiKey: '' };
  var busy = false;
  var abortCtrl = null;

  function $(id) { return document.getElementById(id); }

  function loadSummary() {
    try { summary = localStorage.getItem(SUMMARY_KEY) || ''; } catch (e) {}
  }

  function saveSummary() {
    try { localStorage.setItem(SUMMARY_KEY, summary); } catch (e) {}
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        settings.baseUrl = s.baseUrl || '';
        settings.model = s.model || DEFAULT_MODEL;
        settings.apiKey = s.apiKey || '';
      }
    } catch (e) {}
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function loadHistory() {
    try {
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
    } catch (e) {}
  }

  var summarizing = false;
  var attachedFile = null;
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
      return readFileAsText(file).then(function () {
        return Promise.reject(new Error('File Excel (.xlsx) belum didukung di versi ini — simpan dulu sebagai CSV.' ));
      });
    }
    return Promise.reject(new Error('Jenis file tidak didukung. Gunakan .txt, .md, .csv, .json, .log, atau .pdf.'));
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
        return;
      } catch (e) {}
    }
    el.textContent = text || '';
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
      addBubble(m.role, m.content);
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
        if (delta && delta.content) onDelta(delta.content);
        if (j.choices && j.choices[0] && j.choices[0].finish_reason === 'stop') onDone();
      } catch (e) {}
    });
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

    function addFallbackNote(name) {
      var note = document.createElement('div');
      note.className = 'msg-note';
      note.textContent = '→ otomatis pindah ke ' + name + ' (model sebelumnya sibuk/limit)';
      bubble.appendChild(note);
    }

    function attemptStream(model) {
      abortCtrl = new AbortController();
      attempted.push(model);
      var messages = [{ role: 'system', content: SYSTEM }];
      if (summary) {
        messages.push({ role: 'system', content: 'Ringkasan percakapan sebelumnya:\n' + summary });
      }
      if (attachedFile) {
        messages.push({
          role: 'user',
          content: 'Saya lampirkan isi file "' + attachedFile.name + '":\n\n' + attachedFile.text.slice(0, 20000)
        });
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
          var buffer = { text: '' };
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

    var pool = [settings.model];
    FALLBACKS.forEach(function (f) { if (pool.indexOf(f) === -1) pool.push(f); });

    function next() {
      var model = pool.shift();
      if (!model) return fail(new Error('Semua model gagal.'));
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
    $('set-apikey').value = settings.apiKey || '';
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
    settings.apiKey = $('set-apikey').value.trim();
    saveSettings();
    connSub();
    closeSettings();
    setStatus('Pengaturan disimpan.');
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
    loadHistory();
    loadSummary();
    els.btnSend = $('btn-send');
    els.chatInput = $('chat-input');
    els.chatMessages = $('chat-messages');
    connSub();
    renderHistory();

    $('btn-send').addEventListener('click', sendChat);
    $('btn-attach').addEventListener('click', function () { $('file-input').click(); });
    $('file-input').addEventListener('change', function () {
      if (this.files && this.files[0]) attachFile(this.files[0]);
      this.value = '';
    });
    $('btn-attach-clear').addEventListener('click', clearAttachment);
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
