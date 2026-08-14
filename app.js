/* cangcilung — Asisten AI gratis via model lokal (Ollama)
 * Chat murni: satu tab, kirim pesan, dapat jawaban streaming.
 * Backend: Ollama endpoint OpenAI-compatible /v1/chat/completions.
 */

(function () {
  'use strict';

  var SYSTEM = 'Kamu adalah cangcilung, asisten AI dewasa yang ramah, terus terang, dan membantu. Jawab dalam bahasa Indonesia.';
  var DEFAULT_BASE = '';
  var DEFAULT_PORT = 8080;
  var HISTORY_KEY = 'cangcilung_history';
  var SETTINGS_KEY = 'cangcilung_settings';

  var els = {};
  var history = [];
  var settings = { baseUrl: '', model: '' };
  var busy = false;
  var abortCtrl = null;

  function $(id) { return document.getElementById(id); }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        settings.baseUrl = s.baseUrl || '';
        settings.model = s.model || '';
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
        if (Array.isArray(arr)) history = arr.slice(-100);
      }
    } catch (e) {}
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-100)));
    } catch (e) {}
  }

  function baseUrl() {
    return settings.baseUrl.replace(/\/+$/, '');
  }

  function connSub() {
    var el = $('conn-sub');
    if (!el) return;
    el.textContent = settings.model
      ? 'Model lokal · ' + settings.model
      : 'Model lokal · ' + (baseUrl() || window.location.hostname + ':' + DEFAULT_PORT);
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
      setStatus('Atur model dulu di ⚙️ Pengaturan (contoh: llama3, dolphin-mixtral).', true);
      openSettings();
      return;
    }

    busy = true;
    input.value = '';
    $('btn-send').disabled = true;
    setStatus('Menghubungkan ke model lokal...');

    history.push({ role: 'user', content: text });
    saveHistory();
    renderHistory();

    var bubble = addBubble('assistant', null);
    bubble.classList.add('typing');
    var full = '';

    abortCtrl = new AbortController();
    var body = {
      model: settings.model,
      stream: true,
      messages: [{ role: 'system', content: SYSTEM }].concat(history)
    };

    fetch(baseUrl() + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortCtrl.signal
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw new Error('HTTP ' + res.status + (t ? ' — ' + t.slice(0, 200) : ''));
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
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') {
          bubble.classList.remove('typing');
          busy = false;
          $('btn-send').disabled = false;
          setStatus('');
          return;
        }
        bubble.classList.remove('typing');
        renderMarkdown(bubble, full || '⚠️ Gagal menghubungi model lokal.');
        setStatus('Error: ' + (err && err.message ? err.message : err) + '. Cek apakah server AI lokal jalan & CORS diizinkan.', true);
        busy = false;
        $('btn-send').disabled = false;
      });
  }

  function openSettings() {
    $('set-baseurl').value = baseUrl();
    $('set-model').value = settings.model || '';
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
    saveSettings();
    connSub();
    closeSettings();
    setStatus('Pengaturan disimpan.');
  }

  function testConnection() {
    var url = $('set-baseurl').value.trim().replace(/\/+$/, '');
    var st = $('set-status');
    st.textContent = 'Menguji koneksi...';
    st.className = 'set-status';
    function probeModels(base) {
      return fetch(base + '/v1/models', { signal: AbortSignal.timeout(5000) })
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
        return fetch(url + '/api/tags', { signal: AbortSignal.timeout(5000) })
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
    els.btnSend = $('btn-send');
    els.chatInput = $('chat-input');
    els.chatMessages = $('chat-messages');
    connSub();
    renderHistory();

    $('btn-send').addEventListener('click', sendChat);
    $('chat-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
    $('btn-clear-chat').addEventListener('click', function () {
      if (!busy && history.length && confirm('Hapus seluruh obrolan?')) {
        history = [];
        saveHistory();
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
