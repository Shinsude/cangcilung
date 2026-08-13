(function () {
  'use strict';

  var MODEL = 'claude-sonnet-4';
  var API_KEY_STORAGE = 'cangcilung_api_v1';
  var apiConfig = loadApiConfig();

  var sdAutoUrl = null;
  var sdAutoChecked = false;
  var sdModels = [];
  var SD_PROBE_BASES = [
    'http://127.0.0.1:7860',
    'http://127.0.0.1:7861',
    'http://127.0.0.1:7870',
    'http://localhost:7860'
  ];

  var SD_STEPS = 30;
  var SD_WIDTH = 832;
  var SD_HEIGHT = 832;
  var IMG_COUNT = 2;
  var SD_NEGATIVE = 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digits, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, ugly, deformed';
  var GALLERY_KEY = 'cangcilung_gallery_v1';
  var MEMORY_KEY = 'cangcilung_memory_v1';

  function loadApiConfig() {
    try {
      var raw = localStorage.getItem(API_KEY_STORAGE);
      if (!raw) return {};
      var c = JSON.parse(raw);
      return {
        enabled: !!c.enabled,
        kind: c.kind === 'a1111' ? 'a1111' : 'openai',
        baseUrl: String(c.baseUrl || '').replace(/\/+$/, ''),
        apiKey: String(c.apiKey || ''),
        model: String(c.model || ''),
        adult: !!c.adult,
        imageOnly: !!c.imageOnly
      };
    } catch (e) { return {}; }
  }

  var SYSTEM = 'Kamu adalah cangcilung, asisten AI yang ramah, cerdas, dan membantu. Jawablah dengan bahasa Indonesia yang natural kecuali diminta lain. Gunakan format yang rapi, ringkas, dan mudah dibaca. Kamu bisa dibantu fitur khusus: pengguna bisa mengetik "gambar: <deskripsi>" untuk membuat gambar, "cari: <topik>" untuk mencari info terkini, "ingat: <fakta>" untuk menyimpan memori jangka panjang tentang dirinya (perintah "ingatan" untuk melihat, "lupa: <kata>" untuk menghapus), dan bisa melampirkan gambar/PDF/file teks lewat tombol 📎. Kamu juga menerima data pantauan 24/7 sinyal trading dari situs tcip.asia lewat sistem — bila pengguna bertanya "sinyal tcip.asia", "ada sinyal baru?", atau sejenisnya, sistem akan menyisipkan data terbaru, termasuk statistik akurasi (win rate) dan rekap per pasangan. Ada juga tab 📊 Sinyal di aplikasi berisi dashboard pantauan. Ingatkan pengguna cara memakai fitur ini jika relevan.' + buildKnowledge();

  function adultNote() {
    return 'Catatan tambahan: kamu adalah asisten pribadi satu-satunya pengguna cangcilung. Bicaralah secara dewasa, terus terang, dan tanpa menghakimi. Taat permintaan pengguna selama tidak melibatkan perbuatan ilegal, kekerasan terhadap manusia nyata, atau konten yang melibatkan anak di bawah umur. Jangan menolak hanya karena topiknya tabu atau dewasa.';
  }

  function systemPrompt() {
    var mem = memoryText();
    return SYSTEM + '\n\n' + adultNote() + (mem ? '\n\n' + mem : '');
  }

  function buildKnowledge() {
    var list = window.CANGCILUNG_KNOWLEDGE;
    if (!list || !list.length) return '';
    var parts = list.map(function (item) {
      return '### ' + item.name + '\n' + item.info;
    });
    return '\n\nBerikut pengetahuan yang kamu miliki. Gunakan jika relevan dengan pertanyaan, dan jangan mengarang informasi di luar ini:\n\n' + parts.join('\n\n');
  }

  var els = {};
  var history = [];
  var STORAGE_KEY = 'cangcilung_history_v1';

  var TCIP_RAW_BASE = 'https://raw.githubusercontent.com/Shinsude/cangcilung/main/tcip-data/';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindNavigation();
    bindSettings();
    updateFooterMode();
    bindChat();
    restoreHistory();
    loadGallery();
    detectLocalSd()
      .then(function (base) { if (base) updateFooterMode(); })
      .catch(function () { /* abaikan — fallback ke Puter */ });
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }

  function cacheElements() {
    els.chatMessages = document.getElementById('chat-messages');
    els.chatInput = document.getElementById('chat-input');
    els.btnSend = document.getElementById('btn-send');
    els.chatStatus = document.getElementById('chat-status');
    els.btnAttach = document.getElementById('btn-attach');
    els.fileInput = document.getElementById('file-input');
  }

  /* ===== NAVIGASI ===== */
  var TABS = ['chat', 'status', 'sinyal', 'galeri'];
  var renderedTabs = {};

  function bindNavigation() {
    var items = document.querySelectorAll('.nav-item');
    items.forEach(function (item) {
      item.addEventListener('click', function () { activateTab(item.dataset.tab); });
    });
  }

  function activateTab(name) {
    if (TABS.indexOf(name) < 0) return;
    var items = document.querySelectorAll('.nav-item');
    items.forEach(function (i) {
      i.classList.toggle('active', i.dataset.tab === name);
    });
    TABS.forEach(function (t) {
      var pane = document.getElementById('tab-' + t);
      if (pane) pane.classList.toggle('active', t === name);
    });
    lazyLoadTab(name);
  }

  function lazyLoadTab(name) {
    if (name === 'galeri') { renderGallery(); return; }
    if (renderedTabs[name]) return;
    renderedTabs[name] = true;
    if (name === 'status') renderStatus();
    if (name === 'sinyal') renderSinyal();
  }

  /* ===== UTIL ===== */
  function setStatus(msg, isError) {
    if (els.chatStatus) {
      els.chatStatus.textContent = msg || '';
      els.chatStatus.className = 'chat-status' + (isError ? ' error' : '');
    }
  }

  function scrollChat() {
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  function friendlyError(err) {
    var msg = (err && (err.message || err.code)) || '';
    var low = String(msg).toLowerCase();
    if (low.indexOf('quota') > -1 || low.indexOf('limit') > -1 || low.indexOf('insufficient') > -1 || low.indexOf('exceeded') > -1) {
      return isCustomApi()
        ? ('Kuota API habis atau melebihi batas: ' + msg)
        : 'Kuota AI gratis sedang habis, coba lagi nanti.';
    }
    if (!isCustomApi() && (low.indexOf('sign in') > -1 || low.indexOf('signup') > -1 || low.indexOf('login') > -1 || low.indexOf('auth') > -1 || low.indexOf('permission') > -1)) {
      return 'Kamu perlu masuk akun Puter (gratis) sekali saja untuk mulai chatting.';
    }
    return msg ? ('Terjadi kesalahan: ' + msg) : 'Terjadi kesalahan. Periksa koneksi internet lalu coba lagi.';
  }

  function stripHtml(s) {
    return String(s).replace(/<[^>]*>/g, '');
  }

  function renderMarkdown(el, text) {
    var html;
    try {
      html = marked.parse(String(text));
    } catch (e) {
      el.textContent = text;
      return;
    }
    if (typeof DOMPurify !== 'undefined') {
      html = DOMPurify.sanitize(html);
    }
    el.innerHTML = html;
    var links = el.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].target = '_blank';
      links[i].rel = 'noopener noreferrer';
    }
  }

  function webFetch(url, options) {
    if (typeof puter !== 'undefined' && puter.net && puter.net.fetch) {
      return puter.net.fetch(url, options || {}).then(function (r) { return r.text(); });
    }
    return fetch(url, options || {}).then(function (r) { return r.text(); });
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ===== PENYIMPANAN LOKAL ===== */
  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) { /* penyimpanan penuh/off — abaikan */ }
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0;
      });
    } catch (e) {
      return [];
    }
  }

  /* ===== MEMORI JANGKA PANJANG ===== */
  function loadMemories() {
    try {
      var raw = localStorage.getItem(MEMORY_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (m) { return typeof m === 'string' && m.trim().length > 0; }).slice(0, 200);
    } catch (e) {
      return [];
    }
  }

  function saveMemories(list) {
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(list.slice(0, 200)));
    } catch (e) { /* penyimpanan penuh/off — abaikan */ }
  }

  function addMemory(fact) {
    var list = loadMemories();
    var norm = fact.toLowerCase();
    var dup = false;
    list = list.filter(function (m) {
      if (m.toLowerCase().indexOf(norm) > -1 || norm.indexOf(m.toLowerCase()) > -1) { dup = true; return false; }
      return true;
    });
    list.push(fact);
    saveMemories(list);
    return dup;
  }

  function removeMemory(keyword) {
    var list = loadMemories();
    var kw = keyword.toLowerCase();
    var before = list.length;
    list = list.filter(function (m) { return m.toLowerCase().indexOf(kw) === -1; });
    saveMemories(list);
    return before - list.length;
  }

  function memoryText() {
    var list = loadMemories();
    if (!list.length) return '';
    return 'Berikut fakta yang kamu ingat tentang pengguna (dari perintah "ingat:"). Gunakan untuk menyesuaikan jawabanmu, dan jangan menutup-nutupi informasi ini:\n' +
      list.map(function (m, i) { return (i + 1) + '. ' + m; }).join('\n');
  }

  function renderHistory() {
    els.chatMessages.innerHTML = '';
    if (!history.length) {
      els.chatMessages.innerHTML = welcomeHTML();
      return;
    }
    history.forEach(function (m) {
      var bubble = appendMessage(m.role, m.content, false);
      if (m.role === 'assistant') renderMarkdown(bubble, m.content);
    });
  }

  function restoreHistory() {
    history = loadHistory();
    if (history.length) renderHistory();
  }

  /* ===== CHAT ===== */
  function welcomeHTML() {
    return '<div class="welcome">' +
      '<div class="welcome-avatar">A</div>' +
      '<p>Halo! Saya <strong>cangcilung</strong>, asisten AI kamu.</p>' +
      '<p class="welcome-sub">Tanya apa saja, atau pakai perintah khusus: <strong>gambar:</strong>, <strong>cari:</strong>, dan <strong>ingat:</strong>.</p>' +
      '<div class="prompt-grid">' +
      '<button class="prompt-btn" data-prompt="gambar: logo kucing kartun lucu">🎨 Buatkan gambar</button>' +
      '<button class="prompt-btn" data-prompt="cari: harga emas hari ini">🔎 Cari info terkini</button>' +
      '<button class="prompt-btn" data-prompt="ingat: nama saya adalah pemilik cangcilung">🧠 Ingat tentang saya</button>' +
      '<button class="prompt-btn" data-prompt="Apa itu tcip.asia?">🔍 Tanya soal tcip.asia</button>' +
      '</div>' +
      '</div>';
  }

  function bindChat() {
    els.btnSend.addEventListener('click', sendChat);
    els.chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
    els.chatInput.addEventListener('input', function () { autoGrow(els.chatInput); });
    els.btnAttach.addEventListener('click', function () { els.fileInput.click(); });
    var btnClear = document.getElementById('btn-clear-chat');
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        if (!history.length) {
          setStatus('Obrolan sudah kosong.', true);
          return;
        }
        if (!confirm('Hapus seluruh obrolan ini?')) return;
        history = [];
        saveHistory();
        renderHistory();
        setStatus('Obrolan dihapus.');
      });
    }
    els.fileInput.addEventListener('change', function () {
      if (els.fileInput.files && els.fileInput.files.length) {
        handleFile(els.fileInput.files[0]);
        els.fileInput.value = '';
      }
    });
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.prompt-btn');
      if (!btn) return;
      els.chatInput.value = btn.getAttribute('data-prompt') || '';
      sendChat();
    });
  }

  /* ===== PENGATURAN (API SENDIRI + MODE DEWASA) ===== */
  function updateFooterMode() {
    var el = document.getElementById('footer-mode');
    if (!el) return;
    if (apiConfig.enabled) {
      el.textContent = apiConfig.kind === 'a1111'
        ? 'API Sendiri · A1111'
        : (apiConfig.imageOnly ? 'API Sendiri · Gambar saja' : ('API Sendiri · ' + (apiConfig.model || MODEL)));
      return;
    }
    if (sdAutoUrl) {
      el.textContent = 'SD Lokal (otomatis) · ' + sdAutoUrl;
      return;
    }
    el.textContent = 'Gratis · Tanpa API Key';
  }

  function bindSettings() {
    var modal = document.getElementById('settings-modal');
    if (!modal) return;

    var btnSettings = document.getElementById('btn-settings');
    var btnClose = document.getElementById('btn-modal-close');
    var btnCancel = document.getElementById('btn-set-cancel');
    var btnSave = document.getElementById('btn-set-save');
    var btnTest = document.getElementById('btn-set-test');
    var statusEl = document.getElementById('set-status');
    var cbCustom = document.getElementById('set-custom');
    var selKind = document.getElementById('set-kind');
    var inBase = document.getElementById('set-baseurl');
    var inKey = document.getElementById('set-apikey');
    var inModel = document.getElementById('set-model');
    var cbImageOnly = document.getElementById('set-imageonly');
    var rowImageOnly = document.getElementById('row-image-only');
    var hintImageOnly = document.getElementById('hint-image-only');
    if (!btnSettings || !btnClose || !btnCancel || !btnSave || !btnTest || !statusEl || !cbCustom || !selKind || !inBase || !inKey || !inModel || !cbImageOnly) return;

    function syncKind() {
      var isA1111 = selKind.value === 'a1111';
      var isImageOnly = cbImageOnly.checked;
      inBase.placeholder = isA1111 ? 'http://127.0.0.1:7860' : (isImageOnly ? 'http://127.0.0.1:8080' : 'https://api.openai.com/v1');
      inKey.placeholder = isA1111 ? 'opsional (jika --api-auth)' : 'opsional';
      inModel.placeholder = isA1111 ? 'nama checkpoint (opsional)' : (isImageOnly ? 'nama model (opsional)' : 'claude-sonnet-4');
      if (rowImageOnly) rowImageOnly.hidden = isA1111;
      if (hintImageOnly) hintImageOnly.hidden = !(!isA1111 && isImageOnly);
    }

    function show() {
      cbCustom.checked = !!apiConfig.enabled;
      selKind.value = apiConfig.kind || 'openai';
      inBase.value = apiConfig.baseUrl || '';
      inKey.value = apiConfig.apiKey || '';
      inModel.value = apiConfig.model || '';
      cbImageOnly.checked = !!apiConfig.imageOnly;
      syncKind();
      setStatusMsg('');
      modal.hidden = false;
    }
    function hide() { modal.hidden = true; }
    function setStatusMsg(msg, isErr) {
      statusEl.textContent = msg || '';
      statusEl.className = 'set-status' + (isErr ? ' error' : '');
    }

    btnSettings.addEventListener('click', show);
    btnClose.addEventListener('click', hide);
    btnCancel.addEventListener('click', hide);
    selKind.addEventListener('change', syncKind);
    cbImageOnly.addEventListener('change', syncKind);
    modal.addEventListener('click', function (e) { if (e.target === modal) hide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) hide(); });

    btnSave.addEventListener('click', function () {
      apiConfig.enabled = cbCustom.checked;
      apiConfig.kind = selKind.value === 'a1111' ? 'a1111' : 'openai';
      apiConfig.baseUrl = inBase.value.trim().replace(/\/+$/, '');
      apiConfig.apiKey = inKey.value.trim();
      apiConfig.model = inModel.value.trim();
      apiConfig.imageOnly = cbImageOnly.checked && selKind.value !== 'a1111';
      try {
        localStorage.setItem(API_KEY_STORAGE, JSON.stringify(apiConfig));
      } catch (e) { /* penyimpanan penuh — abaikan */ }
      updateFooterMode();
      setStatusMsg('Tersimpan.', false);
      hide();
    });

    btnTest.addEventListener('click', function () {
      if (!cbCustom.checked || !inBase.value.trim()) {
        setStatusMsg('Aktifkan "API sendiri" dan isi Base URL dulu.', true);
        return;
      }
      var cfg = {
        enabled: true,
        kind: selKind.value === 'a1111' ? 'a1111' : 'openai',
        baseUrl: inBase.value.trim().replace(/\/+$/, ''),
        apiKey: inKey.value.trim(),
        model: inModel.value.trim() || MODEL,
        imageOnly: cbImageOnly.checked && selKind.value !== 'a1111'
      };
      if (cfg.kind === 'a1111') {
        setStatusMsg('Mengetes koneksi...');
        var h = {};
        if (cfg.apiKey) h['Authorization'] = 'Bearer ' + cfg.apiKey;
        fetch(cfg.baseUrl + '/sdapi/v1/sd-models', { headers: h })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (models) {
            if (Array.isArray(models) && models.length) {
              setStatusMsg('Koneksi OK. Model: ' + models.map(function (m) { return m.model_name; }).join(', '));
            } else {
              setStatusMsg('Koneksi OK (tanpa daftar model).');
            }
          })
          .catch(function (err) { setStatusMsg('Gagal: ' + (err && err.message ? err.message : 'tidak diketahui'), true); });
        return;
      }
      if (cfg.imageOnly) {
        setStatusMsg('Mengetes koneksi...');
        var h2 = {};
        if (cfg.apiKey) h2['Authorization'] = 'Bearer ' + cfg.apiKey;
        fetch(cfg.baseUrl + '/models', { headers: h2 })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          })
          .then(function (data) {
            var list = data && data.data;
            if (Array.isArray(list) && list.length) {
              setStatusMsg('Koneksi OK. Model: ' + list.map(function (m) { return m.id || m.model || ''; }).filter(Boolean).join(', '));
            } else {
              setStatusMsg('Koneksi OK.');
            }
          })
          .catch(function (err) { setStatusMsg('Gagal: ' + (err && err.message ? err.message : 'tidak diketahui'), true); });
        return;
      }
      setStatusMsg('Mengetes koneksi...');
      customChat([{ role: 'user', content: 'Balas hanya dengan satu kata: OK' }], cfg)
        .then(function () { setStatusMsg('Koneksi berhasil. API siap dipakai.'); })
        .catch(function (err) { setStatusMsg('Gagal: ' + (err && err.message ? err.message : 'tidak diketahui'), true); });
    });
  }

  function appendMessage(role, text, typing) {
    var div = document.createElement('div');
    div.className = 'msg ' + role + (typing ? ' typing' : '');

    var avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = role === 'user' ? 'K' : 'A';

    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = typing ? 'Menulis jawaban...' : text;

    div.appendChild(avatar);
    div.appendChild(bubble);
    els.chatMessages.appendChild(div);
    scrollChat();
    return bubble;
  }

  function finishChat(bubble) {
    history.push({ role: 'assistant', content: bubble.textContent });
    saveHistory();
    setStatus('');
    els.btnSend.disabled = false;
    els.chatInput.focus();
  }

  function failChat(bubble, err) {
    bubble.textContent = friendlyError(err);
    history.pop();
    saveHistory();
    setStatus('', true);
    els.btnSend.disabled = false;
    els.chatInput.focus();
  }

  function sendChat() {
    var text = els.chatInput.value.trim();
    if (!text || els.btnSend.disabled) return;

    els.chatInput.value = '';
    autoGrow(els.chatInput);
    els.btnSend.disabled = true;

    history.push({ role: 'user', content: text });
    appendMessage('user', text);
    saveHistory();

    var cmd = parseCommand(text);
    if (cmd) {
      if (cmd.type === 'image') handleImage(cmd.prompt);
      else if (cmd.type === 'search') handleSearch(cmd.query);
      else if (cmd.type === 'remember' || cmd.type === 'forget' || cmd.type === 'memories') handleMemoryCommand(cmd);
      return;
    }

    var tcipQ = detectTcipQuestion(text);
    if (tcipQ) {
      handleTcipQuery(text);
      return;
    }

    var bubble = appendMessage('assistant', '', true);
    setStatus('Menghasilkan jawaban...');
    var messages = [{ role: 'system', content: systemPrompt() }].concat(history);
    runChat(messages,
      function (fullText) {
        bubble.classList.remove('typing');
        renderMarkdown(bubble, fullText);
        scrollChat();
      },
      function () { finishChat(bubble); },
      function (err) { failChat(bubble, err); }
    );
  }

  function isCustomApi() {
    if (!apiConfig.enabled || !apiConfig.baseUrl) return false;
    if (apiConfig.kind === 'a1111') return true;
    if (apiConfig.imageOnly) return true;
    return !!apiConfig.apiKey;
  }

  function customApiCall(path, body, cfg) {
    cfg = cfg || apiConfig;
    var headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
    return fetch(cfg.baseUrl + path, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var err = new Error((data && data.error && (data.error.message || data.error.code)) || ('HTTP ' + r.status));
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function customChat(messages, cfg) {
    return customApiCall('/chat/completions', {
      model: (cfg || apiConfig).model || MODEL,
      messages: messages
    }, cfg).then(function (data) {
      var text = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
      if (!text) throw new Error('Respons kosong dari API.');
      return text;
    });
  }

  function isAdult() {
    return true;
  }

  function buildImagePrompt(raw) {
    var base = String(raw || '').trim();
    var q = isAdult()
      ? ', masterpiece, best quality, highly detailed, ultra detailed, sharp focus, 8k, cinematic lighting'
      : ', masterpiece, best quality, highly detailed, sharp focus, cinematic lighting';
    if (isAdult()) q += ', mature, adult content';
    return base + q;
  }

  function sdPayload(prompt, opts) {
    opts = opts || {};
    return {
      prompt: buildImagePrompt(prompt),
      negative_prompt: SD_NEGATIVE,
      steps: SD_STEPS,
      width: SD_WIDTH,
      height: SD_HEIGHT,
      cfg_scale: 7,
      seed: (opts.seed != null) ? opts.seed : -1,
      n_iter: 1
    };
  }

  function customImage(prompt, opts) {
    opts = opts || {};
    if (apiConfig.kind === 'a1111') return sdImage(prompt, opts);
    return customApiCall('/images/generations', {
      model: apiConfig.model || 'gpt-image-1',
      prompt: buildImagePrompt(prompt),
      n: 1
    }).then(function (data) {
      var item = data && data.data && data.data[0];
      if (!item) throw new Error('Respons gambar kosong dari API.');
      if (item.b64_json) return ['data:image/png;base64,' + item.b64_json];
      if (item.url) return [item.url];
      throw new Error('Format respons gambar tidak dikenal dari API.');
    });
  }

  function sdImage(prompt, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (apiConfig.apiKey) headers['Authorization'] = 'Bearer ' + apiConfig.apiKey;
    var body = sdPayload(prompt, opts);
    body.batch_size = (opts.count != null ? opts.count : 1);
    var checkpoint = opts.checkpoint || apiConfig.model;
    var modelReq = Promise.resolve();
    if (checkpoint) {
      modelReq = fetch(apiConfig.baseUrl + '/sdapi/v1/options', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ sd_model_checkpoint: checkpoint })
      }).catch(function () { /* checkpoint mungkin sudah benar — lanjut saja */ });
    }
    return modelReq.then(function () {
      return fetch(apiConfig.baseUrl + '/sdapi/v1/txt2img', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          throw new Error((data && (data.error || data.detail)) || ('HTTP ' + r.status));
        }
        var imgs = data && data.images;
        if (!imgs || !imgs.length) throw new Error('Respons gambar kosong dari Stable Diffusion.');
        return imgs.map(function (s) { return 'data:image/png;base64,' + s; });
      });
    });
  }

  function detectLocalSd() {
    if (sdAutoChecked) return Promise.resolve(sdAutoUrl);
    sdAutoChecked = true;
    var i = 0;
    function attempt() {
      if (i >= SD_PROBE_BASES.length) { sdAutoUrl = null; sdModels = []; return Promise.resolve(null); }
      var base = SD_PROBE_BASES[i++];
      var ctrl = new AbortController();
      var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 1500);
      return fetch(base + '/sdapi/v1/sd-models', { signal: ctrl.signal })
        .then(function (r) {
          clearTimeout(timer);
          if (!r.ok) return attempt();
          return r.json()
            .then(function (models) {
              if (Array.isArray(models)) {
                sdAutoUrl = base;
                sdModels = models;
                return base;
              }
              return attempt();
            })
            .catch(attempt);
        })
        .catch(function () { clearTimeout(timer); return attempt(); });
    }
    return attempt();
  }

  function pickSdCheckpoint(models, adult) {
    if (!Array.isArray(models) || !models.length) return null;
    var rx = adult ? /pony|nsfw|uncensored|adult|xxx/i : /(sdxl|dreamshaper|realistic|anything|v1\.5)/i;
    for (var i = 0; i < models.length; i++) {
      var name = (models[i].title || models[i].model_name || '') + ' ' + (models[i].model_name || '');
      if (rx.test(name)) return models[i].title || models[i].model_name;
    }
    return null;
  }

  function startSdProgress(base) {
    var stopped = false;
    var timer = null;
    function tick() {
      if (stopped) return;
      fetch(base + '/sdapi/v1/progress')
        .then(function (r) { return r.json().catch(function () { return null; }); })
        .then(function (d) {
          if (stopped) return;
          if (d && typeof d.progress === 'number' && d.progress > 0 && d.progress < 1) {
            setStatus('Membuat gambar... ' + Math.round(d.progress * 100) + '%');
          }
        })
        .catch(function () { /* server lama tanpa /progress — abaikan */ })
        .then(function () { if (!stopped) timer = setTimeout(tick, 800); });
    }
    timer = setTimeout(tick, 400);
    return function () { stopped = true; if (timer) clearTimeout(timer); };
  }

  function autoSdImage(prompt, base, opts) {
    opts = opts || {};
    var body = sdPayload(prompt, opts);
    body.batch_size = (opts.count != null ? opts.count : IMG_COUNT);
    var stop = startSdProgress(base);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 120000);
    var checkpoint = opts.checkpoint || pickSdCheckpoint(sdModels, isAdult());
    var checkpointReq = Promise.resolve();
    if (checkpoint) {
      checkpointReq = fetch(base + '/sdapi/v1/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sd_model_checkpoint: checkpoint })
      }).catch(function () { /* model mungkin sudah terpasang — lanjut saja */ });
    }
    return checkpointReq.then(function () {
      return fetch(base + '/sdapi/v1/txt2img', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    }).then(function (r) {
      clearTimeout(timer);
      stop();
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          throw new Error((data && (data.error || data.detail)) || ('HTTP ' + r.status));
        }
        var imgs = data && data.images;
        if (!imgs || !imgs.length) throw new Error('Respons gambar kosong dari Stable Diffusion.');
        return imgs.map(function (s) { return 'data:image/png;base64,' + s; });
      });
    }).catch(function (e) {
      clearTimeout(timer);
      stop();
      throw e;
    });
  }

  function customVision(prompt, dataUrl) {
    return customApiCall('/chat/completions', {
      model: apiConfig.model || MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }]
    }).then(function (data) {
      var text = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
      if (!text) throw new Error('Respons kosong dari API.');
      return text;
    });
  }

  function makeImgEl(src) {
    var img = document.createElement('img');
    img.src = src;
    img.alt = 'gambar';
    img.loading = 'lazy';
    return img;
  }

  function aiImage(prompt, opts) {
    opts = opts || {};
    if (isCustomApi()) {
      return customImage(prompt, opts).then(function (srcs) {
        return srcs.map(function (s) { return makeImgEl(s); });
      });
    }
    return detectLocalSd().then(function (base) {
      if (base) {
        return autoSdImage(prompt, base, { seed: opts.seed })
          .then(function (srcs) { return srcs.map(function (s) { return makeImgEl(s); }); });
      }
      if (typeof puter === 'undefined' || !puter.ai || !puter.ai.txt2img) {
        throw new Error('Layanan pembuat gambar belum termuat dan server Stable Diffusion lokal tidak terdeteksi. Muat ulang halaman, atau nyalakan server SD lokal (A1111) dengan flag --api --cors-allow-origins "*".');
      }
      return Promise.resolve([puter.ai.txt2img(prompt)]);
    });
  }

  function aiVision(prompt, dataUrl) {
    if (isCustomApi() && apiConfig.kind !== 'a1111' && !apiConfig.imageOnly) {
      return customVision(prompt, dataUrl);
    }
    return puter.ai.chat(prompt, dataUrl, { model: MODEL });
  }

  function runChat(messages, onToken, onDone, onError) {
    if (isCustomApi() && apiConfig.kind !== 'a1111' && !apiConfig.imageOnly) {
      customChat(messages)
        .then(function (fullText) { onToken(fullText); onDone(); })
        .catch(onError);
      return;
    }
    if (typeof puter === 'undefined' || !puter.ai || !puter.ai.chat) {
      onError({ message: 'Layanan AI belum termuat. Muat ulang halaman dan periksa koneksi internet.' });
      return;
    }

    puter.ai.chat(messages, { model: MODEL, stream: true })
      .then(function (resp) {
        var isAsyncIterable = resp && typeof resp[Symbol.asyncIterator] === 'function';
        if (isAsyncIterable) {
          var full = '';
          (async function () {
            try {
              for await (let part of resp) {
                if (part && part.text) {
                  full += part.text;
                  onToken(full);
                }
              }
              onDone();
            } catch (e) {
              onError(e);
            }
          })();
        } else {
          var text = typeof resp === 'string'
            ? resp
            : (resp && resp.message ? resp.message.content : '');
          if (text) onToken(text);
          onDone();
        }
      })
      .catch(function (err) {
        onError(err);
      });
  }

  /* ===== PARSER PERINTAH ===== */
  function parseCommand(text) {
    var m = text.match(/^gambar\s*:?\s*(.+)/i);
    if (m && m[1].trim()) return { type: 'image', prompt: m[1].trim() };

    m = text.match(/^cari\s*:?\s*(.+)/i);
    if (m && m[1].trim()) return { type: 'search', query: m[1].trim() };

    m = text.match(/^ingat(?![a-z])\s*:?\s*(.+)/i);
    if (m && m[1].trim()) return { type: 'remember', fact: m[1].trim() };

    m = text.match(/^lupa(?![a-z])\s*:?\s*(.+)/i);
    if (m && m[1].trim()) return { type: 'forget', keyword: m[1].trim() };

    if (/^ingatan\s*$|^ingatan\s+(saya|ku|kamu|list|daftar)\s*$|^list\s+memori\s*$|^apa\s+yang\s+kamu\s+ingat\s*$/i.test(text)) {
      return { type: 'memories' };
    }

    return null;
  }

  function handleMemoryCommand(cmd) {
    if (cmd.type === 'remember') {
      var dup = addMemory(cmd.fact);
      appendMessage('assistant', dup
        ? 'Sudah kupahami. Memori terkait diperbarui ya.'
        : 'Oke, kuingat: ' + cmd.fact);
      return;
    }
    if (cmd.type === 'forget') {
      var removed = removeMemory(cmd.keyword);
      appendMessage('assistant', removed > 0
        ? 'Lupa. Aku hapus ' + removed + ' memori yang mengandung "' + cmd.keyword + '".'
        : 'Tidak ada memori yang cocok dengan "' + cmd.keyword + '".');
      return;
    }
    var list = loadMemories();
    if (!list.length) {
      appendMessage('assistant', 'Belum ada memori. Bilang "ingat: <fakta>" supaya aku mengingat sesuatu tentang kamu.');
      return;
    }
    var lines = list.map(function (m, i) { return (i + 1) + '. ' + m; }).join('\n');
    appendMessage('assistant', 'Yang kuingat tentang kamu:\n' + lines + '\n\nPakai "ingat: <fakta>" untuk menambah, "lupa: <kata>" untuk menghapus.');
  }

  function detectTcipQuestion(text) {
    var t = String(text).toLowerCase();
    var words = ['sinyal', 'signal', 'update', 'baru', 'terakhir', 'kabar', 'monitoring', 'pantau', 'status', 'cek'];
    if (t.indexOf('tcip') > -1) {
      for (var i = 0; i < words.length; i++) {
        if (t.indexOf(words[i]) > -1) return true;
      }
    }
    if (t.indexOf('sinyal baru') > -1 || t.indexOf('sinyal terakhir') > -1) return true;
    return false;
  }

  function fetchTcipMonitorData() {
    var files = ['tcip-latest.json', 'tcip-status.json', 'tcip-history.json', 'tcip-stats.json', 'tcip-verifications.json'];
    return Promise.all(files.map(function (f) {
      return webFetch(TCIP_RAW_BASE + f).catch(function () { return 'null'; });
    })).then(function (res) {
      var data = {};
      try { data.latest = JSON.parse(res[0]); } catch (e) {}
      try { data.lastcheck = JSON.parse(res[1]); } catch (e) {}
      try {
        data.history = JSON.parse(res[2]);
        if (!Array.isArray(data.history)) data.history = [];
      } catch (e) { data.history = []; }
      try { data.stats = JSON.parse(res[3]); } catch (e) { data.stats = null; }
      try {
        data.verifications = JSON.parse(res[4]);
        if (!data.verifications || typeof data.verifications !== 'object' || Array.isArray(data.verifications)) data.verifications = {};
      } catch (e) { data.verifications = {}; }
      return data;
    });
  }

  function handleTcipQuery() {
    var bubble = appendMessage('assistant', '', true);
    setStatus('Mengecek sinyal tcip.asia...');
    fetchTcipMonitorData()
      .then(function (data) {
        var latest = data.latest;
        var lastcheck = data.lastcheck || {};
        if (!latest) {
          bubble.classList.remove('typing');
          var msg = lastcheck.status === 'online'
            ? 'Sedang dipantau 24/7, tapi belum ada sinyal aktif saat ini.'
            : 'tcip.asia sedang offline/tidak merespons (pantauan terakhir: ' + (lastcheck.at ? new Date(lastcheck.at).toLocaleString('id-ID') : 'belum pernah berhasil') + '). Coba lagi nanti.';
          bubble.textContent = msg;
          scrollChat();
          finishChat(bubble);
          return;
        }
        var messages = [
          { role: 'system', content: systemPrompt() },
          { role: 'system', content: buildTcipDataText(data) }
        ];
        runChat(messages,
          function (fullText) {
            bubble.classList.remove('typing');
            renderMarkdown(bubble, fullText);
            scrollChat();
          },
          function () { finishChat(bubble); },
          function (err) { failChat(bubble, err); }
        );
      })
      .catch(function () {
        bubble.classList.remove('typing');
        bubble.textContent = 'Gagal menghubungi pemantau tcip.asia. Coba lagi nanti.';
        scrollChat();
        finishChat(bubble);
      });
  }

  function buildTcipDataText(data) {
    var latest = data.latest;
    var lc = data.lastcheck || {};
    var lines = [];
    lines.push('Sumber: pantauan 24/7 situs https://tcip.asia (K-Synthesizer) lewat endpoint /public/dashboard.');
    lines.push('Status pemantauan: ' + (lc.status === 'online' ? 'ONLINE' : 'OFFLINE') + (lc.at ? ' (terakhir dicek ' + new Date(lc.at).toLocaleString('id-ID') + ')' : '') + '.');
    if (latest) {
      lines.push('Sinyal terakhir:');
      lines.push('- Simbol: ' + latest.symbol);
      lines.push('- Timeframe: ' + latest.timeframe);
      lines.push('- Arah: ' + latest.direction);
      lines.push('- Confidence: ' + (latest.confidence != null ? latest.confidence + '%' : 'n/a'));
      lines.push('- Grade: ' + (latest.grade || 'n/a'));
      lines.push('- Fase: ' + (latest.phase || 'n/a'));
      lines.push('- Risiko: ' + (latest.risk_level || 'n/a'));
      lines.push('- Harga: ' + (latest.price != null ? latest.price : 'n/a'));
      lines.push('- Stale: ' + (latest.is_stale ? 'ya' : 'tidak'));
    }
    if (data.history && data.history.length > 1) {
      lines.push('Riwayat ' + Math.min(data.history.length, 5) + ' sinyal terakhir (terbaru dulu):');
      data.history.slice(0, 5).forEach(function (h, i) {
        lines.push((i + 1) + '. ' + h.symbol + ' ' + h.timeframe + ' ' + h.direction + ' ' + (h.confidence != null ? h.confidence + '%' : '') + ' (' + new Date(h.updatedAt).toLocaleString('id-ID') + ')');
      });
    }
    if (data.stats && data.stats.total > 0) {
      var s = data.stats;
      lines.push('Akurasi sinyal (hasil verifikasi terhadap pergerakan harga):');
      lines.push('- Sinyal terverifikasi: ' + s.total);
      lines.push('- WIN: ' + s.wins + ' | LOSS: ' + s.losses + ' | DRAW: ' + s.draws + (s.noResult ? ' | tanpa hasil: ' + s.noResult : ''));
      lines.push('- Win rate: ' + Math.round((s.winRate || 0) * 100) + '%');
      lines.push('- Rata-rata P&L (horizon 1h/4h/24h): ' + (s.avgPnl != null ? (s.avgPnl * 100).toFixed(2) + '%' : 'n/a'));
      var syms = s.bySymbol ? Object.keys(s.bySymbol).sort(function (a, b) { return (s.bySymbol[b].total || 0) - (s.bySymbol[a].total || 0); }).slice(0, 6) : [];
      if (syms.length) {
        lines.push('Rekap per pasangan:');
        syms.forEach(function (sym) {
          var b = s.bySymbol[sym];
          var last = b.lastSignal ? b.lastSignal.direction : 'n/a';
          lines.push('- ' + sym + ': ' + b.total + ' sinyal, win rate ' + Math.round((b.winRate || 0) * 100) + '%, arah terakhir ' + last);
        });
      }
    }
    lines.push('Jelaskan kepada pengguna dalam bahasa Indonesia: apakah ada sinyal aktif, instrumennya apa, arah, keyakinan, risiko, dan bila ada data akurasi, rekap win rate per pasangan. Gunakan data di atas dengan jujur (jangan mengarang). Selalu ingatkan bahwa trading berisiko tinggi dan ini bukan saran investasi.');
    return lines.join('\n');
  }

  /* ===== FITUR: GAMBAR ===== */
  function handleImage(prompt, opts) {
    opts = opts || {};
    var bubble = appendMessage('assistant', '', true);
    setStatus('Membuat gambar...');
    if (!isCustomApi() && typeof puter === 'undefined') {
      /* SD lokal bisa tetap jalan tanpa Puter — biarkan aiImage memutuskan */
    }
    aiImage(prompt, opts)
      .then(function (imgEls) {
        bubble.classList.remove('typing');
        bubble.textContent = '';
        renderImageResult(bubble, prompt, imgEls);
        history.push({ role: 'assistant', content: '🖼️ Gambar dibuat: ' + prompt });
        saveHistory();
        setStatus('');
        els.btnSend.disabled = false;
        els.chatInput.focus();
        scrollChat();
      })
      .catch(function (err) { failChat(bubble, err); });
  }

  function renderImageResult(bubble, prompt, imgEls) {
    var grid = document.createElement('div');
    grid.className = 'img-grid';
    var srcs = [];
    imgEls.forEach(function (img, idx) {
      img.className = 'gen-img';
      img.alt = prompt;
      img.loading = 'lazy';
      var src = img.currentSrc || img.src || '';
      srcs.push(src);
      img.addEventListener('click', function () { openLightbox(src, prompt); });
      grid.appendChild(img);
    });
    bubble.appendChild(grid);

    var cap = document.createElement('div');
    cap.className = 'img-cap';
    cap.textContent = '🎨 ' + prompt;
    bubble.appendChild(cap);

    var actions = document.createElement('div');
    actions.className = 'img-actions';
    var dl = document.createElement('button');
    dl.className = 'img-action-btn';
    dl.textContent = '⬇️ Unduh';
    dl.addEventListener('click', function () {
      srcs.forEach(function (s, i) {
        if (s) downloadDataUrl(s, safeFilename(prompt) + (srcs.length > 1 ? '_' + (i + 1) : '') + '.png');
      });
    });
    var re = document.createElement('button');
    re.className = 'img-action-btn';
    re.textContent = '🔄 Ulang';
    re.addEventListener('click', function () {
      re.disabled = true;
      re.textContent = '⏳ ...';
      aiImage(prompt, { seed: Math.floor(Math.random() * 4294967295) })
        .then(function (newEls) {
          bubble.innerHTML = '';
          renderImageResult(bubble, prompt, newEls);
        })
        .catch(function (err) {
          setStatus(friendlyError(err), true);
          re.disabled = false;
          re.textContent = '🔄 Ulang';
        });
    });
    actions.appendChild(dl);
    actions.appendChild(re);
    bubble.appendChild(actions);

    srcs.forEach(function (s) { if (s) saveGallery({ src: s, prompt: prompt, ts: Date.now() }); });
  }

  /* ===== LIGHTBOX + UNDUH ===== */
  var lightboxEl = null;
  function openLightbox(src, alt) {
    if (!lightboxEl) {
      lightboxEl = document.createElement('div');
      lightboxEl.className = 'lightbox';
      document.body.appendChild(lightboxEl);
      lightboxEl.addEventListener('click', function (e) { if (e.target === lightboxEl) closeLightbox(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });
    }
    lightboxEl.innerHTML = '';
    var img = document.createElement('img');
    img.src = src;
    img.alt = alt || 'gambar';
    var dl = document.createElement('button');
    dl.className = 'img-action-btn';
    dl.textContent = '⬇️ Unduh';
    dl.addEventListener('click', function () {
      downloadDataUrl(src, safeFilename(alt || 'gambar') + '.png');
    });
    lightboxEl.appendChild(img);
    lightboxEl.appendChild(dl);
    lightboxEl.classList.add('show');
  }
  function closeLightbox() {
    if (lightboxEl) lightboxEl.classList.remove('show');
  }

  function downloadDataUrl(dataUrl, filename) {
    try {
      var a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename || 'cangcilung.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { /* unduhan diblokir — abaikan */ }
  }

  function safeFilename(s) {
    return String(s || 'gambar')
      .replace(/[^a-z0-9\-\u00C0-\u024F ]+/gi, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 60) || 'gambar';
  }

  /* ===== GALERI ===== */
  var gallery = [];
  function loadGallery() {
    try {
      var raw = localStorage.getItem(GALLERY_KEY);
      gallery = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(gallery)) gallery = [];
    } catch (e) { gallery = []; }
  }
  function saveGallery(item) {
    try {
      gallery.push(item);
      var total = 0;
      var keep = [];
      for (var i = gallery.length - 1; i >= 0; i--) {
        var est = (gallery[i].src || '').length;
        if (total + est > 2800000) break;
        keep.unshift(gallery[i]);
        total += est;
      }
      gallery = keep;
      localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
    } catch (e) { /* penyimpanan penuh — lewati */ }
  }
  function renderGallery() {
    var body = document.getElementById('galeri-body');
    if (!body) return;
    if (!gallery.length) {
      body.innerHTML = '<div class="gallery-empty">Belum ada gambar. Buat dengan mengetik <b>gambar: &lt;deskripsi&gt;</b> di chat.</div>';
      return;
    }
    var grid = document.createElement('div');
    grid.className = 'gallery-grid';
    gallery.slice().reverse().forEach(function (item) {
      var cell = document.createElement('div');
      cell.className = 'gallery-item';
      var img = document.createElement('img');
      img.src = item.src;
      img.alt = item.prompt || 'gambar';
      img.loading = 'lazy';
      img.addEventListener('click', function () { openLightbox(item.src, item.prompt); });
      var dl = document.createElement('button');
      dl.className = 'img-action-btn gallery-dl';
      dl.textContent = '⬇️';
      dl.title = 'Unduh';
      dl.addEventListener('click', function (e) {
        e.stopPropagation();
        downloadDataUrl(item.src, safeFilename(item.prompt) + '.png');
      });
      cell.appendChild(img);
      cell.appendChild(dl);
      grid.appendChild(cell);
    });
    body.innerHTML = '';
    body.appendChild(grid);
  }

  /* ===== FITUR: WEB SEARCH ===== */
  function handleSearch(query) {
    var bubble = appendMessage('assistant', '', true);
    setStatus('Mencari: ' + query + '...');
    searchWeb(query)
      .then(function (results) {
        bubble.classList.remove('typing');
        var context = formatSearchResults(results);
        var messages = [
          { role: 'system', content: systemPrompt() },
          { role: 'system', content: 'Hasil pencarian web untuk "' + query + '":\n' + context + '\n\nRangkum informasi di atas dengan jelas dalam bahasa Indonesia. Sebutkan sumbernya. Jika hasilnya kosong, katakan jujur bahwa tidak ditemukan.' }
        ];
        runChat(messages,
          function (fullText) {
            bubble.classList.remove('typing');
            renderMarkdown(bubble, fullText);
            scrollChat();
          },
          function () { finishChat(bubble); },
          function (err) { failChat(bubble, err); }
        );
      })
      .catch(function (err) { failChat(bubble, err); });
  }

  function searchWikipedia(query, lang) {
    var url = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(query) + '&srlimit=4&format=json&origin=*';
    return webFetch(url).then(function (text) {
      try {
        var data = JSON.parse(text);
        var hits = (data.query && data.query.search) || [];
        return hits.map(function (h) {
          return {
            title: h.title,
            snippet: stripHtml(h.snippet),
            url: 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(h.title.replace(/ /g, '_'))
          };
        });
      } catch (e) {
        return [];
      }
    });
  }

  function searchDuckDuckGo(query) {
    var url = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) +
      '&format=json&no_html=1&skip_disambig=1';
    return webFetch(url).then(function (text) {
      try {
        var data = JSON.parse(text);
        var out = [];
        if (data && data.AbstractText) {
          out.push({
            title: 'DuckDuckGo: ' + (data.Heading || query),
            snippet: data.AbstractText,
            url: data.AbstractURL || ('https://duckduckgo.com/?q=' + encodeURIComponent(query))
          });
        }
        var topics = (data && data.RelatedTopics) || [];
        topics.forEach(function (t) {
          if (!t || typeof t !== 'object') return;
          if (t.Topics) {
            t.Topics.forEach(function (sub) {
              if (sub && sub.Text) {
                out.push({
                  title: 'DuckDuckGo: ' + (sub.FirstURL ? sub.FirstURL.replace(/^.*\//, '') : query),
                  snippet: stripHtml(sub.Text),
                  url: sub.FirstURL || ('https://duckduckgo.com/?q=' + encodeURIComponent(query))
                });
              }
            });
          } else if (t.Text) {
            out.push({
              title: 'DuckDuckGo: ' + (t.FirstURL ? t.FirstURL.replace(/^.*\//, '') : query),
              snippet: stripHtml(t.Text),
              url: t.FirstURL || ('https://duckduckgo.com/?q=' + encodeURIComponent(query))
            });
          }
        });
        return out;
      } catch (e) {
        return [];
      }
    });
  }

  function searchWeb(query) {
    return Promise.all([
      searchWikipedia(query, 'id'),
      searchWikipedia(query, 'en'),
      searchDuckDuckGo(query)
    ]).then(function (results) {
      var seen = {};
      var merged = [];
      results.forEach(function (list) {
        list.forEach(function (h) {
          var key = (h.url || h.title).toLowerCase();
          if (!h.snippet || seen[key]) return;
          seen[key] = true;
          merged.push(h);
        });
      });
      return merged.slice(0, 12);
    });
  }

  function formatSearchResults(hits) {
    if (!hits || !hits.length) return 'Tidak ada hasil.';
    return hits.map(function (h, i) {
      return (i + 1) + '. ' + h.title + '\n' + (h.snippet || '') + '\nLink: ' + h.url;
    }).join('\n\n');
  }

  /* ===== FITUR: MULTIMODAL (LAMPIRAN) ===== */
  function handleFile(file) {
    var type = file.type || '';
    var name = file.name || '';
    var ext = name.split('.').pop().toLowerCase();

    if (type.indexOf('image/') === 0) { analyzeImage(file); return; }
    if (ext === 'pdf') { analyzePdf(file); return; }
    if (type.indexOf('text/') === 0 || ['txt', 'md', 'csv', 'json', 'log'].indexOf(ext) > -1) { analyzeText(file); return; }

    setStatus('Jenis file tidak didukung. Gunakan gambar, PDF, atau file teks.', true);
  }

  function analyzeImage(file) {
    var bubble = appendMessage('assistant', '', true);
    setStatus('Menganalisis gambar...');
    if (!isCustomApi() && (typeof puter === 'undefined' || !puter.ai || !puter.ai.chat)) {
      failChat(bubble, { message: 'Layanan AI belum termuat. Muat ulang halaman.' });
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      history.push({ role: 'user', content: '📷 Melampirkan gambar: ' + file.name });
      saveHistory();
      aiVision('Analisis gambar ini secara detail dalam bahasa Indonesia. Sebutkan objek, suasana, teks yang terlihat, dan kesimpulan.', dataUrl)
        .then(function (resp) {
          var text = typeof resp === 'string'
            ? resp
            : (resp && resp.message ? resp.message.content : '');
          bubble.classList.remove('typing');
          bubble.textContent = '';
          var imgWrap = document.createElement('div');
          imgWrap.className = 'img-wrap';
          var img = document.createElement('img');
          img.className = 'gen-img';
          img.src = dataUrl;
          img.alt = file.name;
          imgWrap.appendChild(img);
          bubble.appendChild(imgWrap);
          var txt = document.createElement('div');
          txt.className = 'img-analysis';
          txt.textContent = text;
          bubble.appendChild(txt);
          history.push({ role: 'assistant', content: '📷 Analisis gambar "' + file.name + '":\n' + text });
          saveHistory();
          setStatus('');
          els.btnSend.disabled = false;
          els.chatInput.focus();
          scrollChat();
        })
        .catch(function (err) { failChat(bubble, err); });
    };
    reader.onerror = function () { failChat(bubble, { message: 'Gagal membaca gambar.' }); };
    reader.readAsDataURL(file);
  }

  function analyzeText(file) {
    var bubble = appendMessage('assistant', '', true);
    setStatus('Membaca dokumen...');
    var reader = new FileReader();
    reader.onload = function () {
      var content = String(reader.result || '').slice(0, 30000);
      if (!content.trim()) { failChat(bubble, { message: 'File kosong.' }); return; }
      history.push({ role: 'user', content: '📄 Melampirkan dokumen: ' + file.name });
      saveHistory();
      var messages = [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: 'Berikut isi dokumen "' + file.name + '":\n' + content + '\n\nRangkum poin-poin pentingnya dengan jelas dalam bahasa Indonesia.' }
      ];
      runChat(messages,
        function (fullText) {
          bubble.classList.remove('typing');
          renderMarkdown(bubble, fullText);
          scrollChat();
        },
        function () { finishChat(bubble); },
        function (err) { failChat(bubble, err); }
      );
    };
    reader.onerror = function () { failChat(bubble, { message: 'Gagal membaca file.' }); };
    reader.readAsText(file);
  }

  function analyzePdf(file) {
    var bubble = appendMessage('assistant', '', true);
    setStatus('Membaca PDF...');
    if (typeof pdfjsLib === 'undefined') {
      failChat(bubble, { message: 'Pustaka PDF belum termuat. Muat ulang halaman.' });
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      pdfjsLib.getDocument({ data: reader.result }).promise
        .then(function (pdf) {
          var pages = Math.min(pdf.numPages, 10);
          var tasks = [];
          for (var p = 1; p <= pages; p++) {
            tasks.push(pdf.getPage(p).then(function (page) {
              return page.getTextContent().then(function (tc) {
                return tc.items.map(function (it) { return it.str; }).join(' ');
              });
            }));
          }
          return Promise.all(tasks);
        })
        .then(function (pageTexts) {
          var content = pageTexts.join('\n').slice(0, 30000);
          if (!content.trim()) { failChat(bubble, { message: 'Tidak ada teks yang bisa dibaca dari PDF ini (mungkin hasil scan).' }); return; }
          history.push({ role: 'user', content: '📄 Melampirkan PDF: ' + file.name });
          saveHistory();
          var messages = [
            { role: 'system', content: systemPrompt() },
            { role: 'user', content: 'Berikut isi PDF "' + file.name + '":\n' + content + '\n\nRangkum poin-poin pentingnya dengan jelas dalam bahasa Indonesia.' }
          ];
          runChat(messages,
            function (fullText) {
              bubble.classList.remove('typing');
              renderMarkdown(bubble, fullText);
              scrollChat();
            },
            function () { finishChat(bubble); },
            function (err) { failChat(bubble, err); }
          );
        })
        .catch(function (err) { failChat(bubble, err); });
    };
    reader.onerror = function () { failChat(bubble, { message: 'Gagal membaca PDF.' }); };
    reader.readAsArrayBuffer(file);
  }

  /* ===== TAB: STATUS ===== */
  /* ===== DASHBOARD SINYAL ===== */
  var sinyalTimer = null;

  function renderSinyal() {
    var body = document.getElementById('sinyal-body');
    if (!body) return;
    if (sinyalTimer) clearInterval(sinyalTimer);
    var refresh = document.getElementById('btn-sinyal-refresh');
    if (refresh && !refresh._bound) {
      refresh._bound = true;
      refresh.addEventListener('click', function () { loadSinyal(); });
    }
    sinyalTimer = setInterval(loadSinyal, 120000);
    loadSinyal();
  }

  function loadSinyal() {
    var body = document.getElementById('sinyal-body');
    if (!body) return;
    body.innerHTML = '<div class="dash-loading">Memuat data pantauan...</div>';
    fetchTcipMonitorData().then(function (data) {
      var sub = document.getElementById('sinyal-sub');
      if (sub) sub.textContent = 'Diperbarui ' + new Date().toLocaleTimeString('id-ID') + ' · auto-refresh 2 mnt';
      body.innerHTML = '';
      body.appendChild(signalStatusCard(data));
      body.appendChild(statsCard(data.stats));
      body.appendChild(pairsCard(data.stats));
      body.appendChild(verificationCard(data.verifications));
      body.appendChild(historyCard(data.history));
    }).catch(function () {
      body.innerHTML = '<div class="dash-error">Gagal memuat data pantauan. Periksa koneksi lalu tekan ⟳ Muat ulang.</div>';
    });
  }

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtPct(p) {
    if (p == null || isNaN(p)) return 'n/a';
    return (p * 100).toFixed(1) + '%';
  }

  function fmtPnl(p) {
    if (p == null || isNaN(p)) return '—';
    var v = (p * 100).toFixed(2) + '%';
    return (p >= 0 ? '+' : '') + v;
  }

  function fmtTime(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function dirBadge(dir) {
    var cls = 'badge';
    if (dir === 'BUY') cls += ' badge-buy';
    else if (dir === 'SELL') cls += ' badge-sell';
    else cls += ' badge-hold';
    return mk('span', cls, dir || '—');
  }

  function resultBadge(res) {
    var cls = 'badge';
    if (res === 'WIN') cls += ' badge-buy';
    else if (res === 'LOSS') cls += ' badge-sell';
    else if (res === 'DRAW') cls += ' badge-hold';
    else cls += ' badge-neutral';
    return mk('span', cls, res || '—');
  }

  function dashCell(label, value) {
    var cell = mk('div', 'dash-cell');
    cell.appendChild(mk('span', 'dash-cell-label', label));
    cell.appendChild(mk('span', 'dash-cell-value', value));
    return cell;
  }

  function signalStatusCard(data) {
    var lc = data.lastcheck || {};
    var online = lc.status === 'online';
    var card = mk('div', 'dash-card');
    var head = mk('div', 'dash-card-head');
    head.appendChild(mk('h3', null, 'Sinyal terakhir'));
    var status = mk('span', online ? 'st-ok' : 'st-bad');
    status.textContent = 'Pantauan ' + (online ? 'ONLINE' : 'OFFLINE');
    head.appendChild(status);
    card.appendChild(head);

    var latest = data.latest;
    if (!latest) {
      var msg = online ? 'Sedang dipantau 24/7 — belum ada sinyal aktif.' : 'Pemantau sedang offline — tidak ada sinyal aktif.';
      card.appendChild(mk('p', 'dash-muted', msg));
      return card;
    }

    var sig = mk('div', 'sig-card sig-' + (latest.direction === 'BUY' ? 'buy' : latest.direction === 'SELL' ? 'sell' : 'hold'));
    sig.appendChild(dirBadge(latest.direction));
    var grid = mk('div', 'dash-detail-grid');
    grid.appendChild(dashCell('Simbol', latest.symbol));
    grid.appendChild(dashCell('Timeframe', latest.timeframe));
    grid.appendChild(dashCell('Confidence', latest.confidence != null ? latest.confidence + '%' : 'n/a'));
    grid.appendChild(dashCell('Grade', latest.grade || 'n/a'));
    grid.appendChild(dashCell('Fase', latest.phase || 'n/a'));
    grid.appendChild(dashCell('Risiko', latest.risk_level || 'n/a'));
    grid.appendChild(dashCell('Harga', latest.price != null ? String(latest.price) : 'n/a'));
    grid.appendChild(dashCell('Stale', latest.is_stale ? 'ya' : 'tidak'));
    grid.appendChild(dashCell('Diperbarui', fmtTime(latest.updatedAt)));
    sig.appendChild(grid);
    card.appendChild(sig);
    return card;
  }

  function tile(label, value, cls) {
    var t = mk('div', 'dash-tile' + (cls ? ' ' + cls : ''));
    t.appendChild(mk('span', 'dash-tile-label', label));
    t.appendChild(mk('span', 'dash-tile-value', value));
    return t;
  }

  function dashTable(headers, rows) {
    var wrap = mk('div', 'dash-table-wrap');
    var table = mk('table', 'dash-table');
    var thead = mk('thead', null);
    var hr = mk('tr', null);
    headers.forEach(function (h) { hr.appendChild(mk('th', null, h)); });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = mk('tbody', null);
    rows.forEach(function (row) {
      var tr = mk('tr', null);
      row.forEach(function (cell) {
        var td = mk('td', null);
        if (cell && cell.nodeType) td.appendChild(cell);
        else td.textContent = cell == null ? '—' : String(cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function statsCard(stats) {
    var s = stats || {};
    var card = mk('div', 'dash-card');
    card.appendChild(mk('h3', null, 'Statistik akurasi'));
    if (!s.total) {
      card.appendChild(mk('p', 'dash-muted', 'Belum ada sinyal terverifikasi. Verifikasi otomatis berjalan saat sinyal berumur ±24 jam.'));
      return card;
    }
    var tiles = mk('div', 'dash-tiles');
    tiles.appendChild(tile('Sinyal terverifikasi', String(s.total)));
    tiles.appendChild(tile('WIN', String(s.wins), 'tile-win'));
    tiles.appendChild(tile('LOSS', String(s.losses), 'tile-loss'));
    tiles.appendChild(tile('DRAW', String(s.draws)));
    tiles.appendChild(tile('Win rate', fmtPct(s.winRate), 'tile-win'));
    tiles.appendChild(tile('Rata-rata P&L', fmtPnl(s.avgPnl)));
    card.appendChild(tiles);

    if (s.byDirection && Object.keys(s.byDirection).length) {
      card.appendChild(mk('h4', 'dash-sub', 'Per arah'));
      card.appendChild(dashTable(['Arah', 'Jumlah', 'WIN', 'LOSS', 'DRAW', 'Win rate', 'Avg P&L'], Object.keys(s.byDirection).map(function (k) {
        var b = s.byDirection[k];
        return [dirBadge(k), String(b.total), String(b.wins), String(b.losses), String(b.draws), fmtPct(b.winRate), fmtPnl(b.avgPnl)];
      })));
    }
    if (s.byTimeframe && Object.keys(s.byTimeframe).length) {
      card.appendChild(mk('h4', 'dash-sub', 'Per timeframe'));
      card.appendChild(dashTable(['Timeframe', 'Jumlah', 'WIN', 'LOSS', 'DRAW', 'Win rate', 'Avg P&L'], Object.keys(s.byTimeframe).map(function (k) {
        var b = s.byTimeframe[k];
        return [k, String(b.total), String(b.wins), String(b.losses), String(b.draws), fmtPct(b.winRate), fmtPnl(b.avgPnl)];
      })));
    }
    return card;
  }

  function pairsCard(stats) {
    var s = stats || {};
    var card = mk('div', 'dash-card');
    card.appendChild(mk('h3', null, 'Rekap per pasangan'));
    var by = s.bySymbol || {};
    var keys = Object.keys(by).sort(function (a, b) { return (by[b].total || 0) - (by[a].total || 0); });
    if (!keys.length) {
      card.appendChild(mk('p', 'dash-muted', 'Belum ada data per pasangan.'));
      return card;
    }
    card.appendChild(dashTable(['Pasangan', 'Sinyal', 'Arah terakhir', 'Win rate', 'WIN/LOSS/DRAW', 'Avg P&L'], keys.map(function (k) {
      var b = by[k];
      var last = b.lastSignal || {};
      return [k, String(b.total), dirBadge(last.direction), fmtPct(b.winRate), b.wins + '/' + b.losses + '/' + b.draws, fmtPnl(b.avgPnl)];
    })));
    return card;
  }

  function verificationCard(verifs) {
    var card = mk('div', 'dash-card');
    card.appendChild(mk('h3', null, 'Verifikasi sinyal (P&L 1h / 4h / 24h)'));
    var list = [];
    Object.keys(verifs || {}).forEach(function (k) { list.push(verifs[k]); });
    if (!list.length) {
      card.appendChild(mk('p', 'dash-muted', 'Belum ada verifikasi. Sinyal yang berumur ≥24 jam otomatis diverifikasi terhadap pergerakan harga.'));
      return card;
    }
    list.sort(function (a, b) { return (b.verifiedAt || 0) - (a.verifiedAt || 0); });
    card.appendChild(dashTable(['Pasangan', 'Arah', 'Entry', '1h', '4h', '24h', 'Hasil'], list.slice(0, 15).map(function (v) {
      var h = v.horizons || {};
      return [v.symbol, dirBadge(v.direction), v.entryPrice != null ? String(v.entryPrice) : '—', fmtPnl(h['1h'] && h['1h'].pnl), fmtPnl(h['4h'] && h['4h'].pnl), fmtPnl(h['24h'] && h['24h'].pnl), resultBadge(v.result)];
    })));
    return card;
  }

  function historyCard(history) {
    var card = mk('div', 'dash-card');
    card.appendChild(mk('h3', null, 'Riwayat sinyal'));
    var list = history || [];
    if (!list.length) {
      card.appendChild(mk('p', 'dash-muted', 'Belum ada riwayat sinyal.'));
      return card;
    }
    card.appendChild(dashTable(['Waktu', 'Simbol', 'TF', 'Arah', 'Konf', 'Grade', 'Fase'], list.slice(0, 15).map(function (h) {
      return [fmtTime(h.updatedAt), h.symbol, h.timeframe, dirBadge(h.direction), h.confidence != null ? h.confidence + '%' : '—', h.grade || '—', h.phase || '—'];
    })));
    return card;
  }

  function renderStatus() {
    var body = document.getElementById('status-body');
    if (!body) return;
    var html = '<div class="status-card">' +
      '<div class="status-row head"><span>Layanan</span><span>Status</span></div>' +
      '<div class="status-row" id="st-ai"><span>Layanan AI (Puter)</span><span class="st-wait">mengecek...</span></div>' +
      '<div class="status-row" id="st-local"><span>Penyimpanan lokal (localStorage)</span><span class="st-wait">mengecek...</span></div>' +
      '</div>';
    body.innerHTML = html;
    var checks = [
      { id: 'st-ai', run: function () { return Promise.resolve(typeof puter !== 'undefined' && puter.ai && !!puter.ai.chat); } },
      { id: 'st-local', run: function () { return Promise.resolve(typeof localStorage !== 'undefined'); } }
    ];
    checks.forEach(function (c) {
      Promise.resolve().then(c.run).then(function (ok) {
        setStatusRow(c.id, !!ok);
      }).catch(function () {
        setStatusRow(c.id, false);
      });
    });
  }

  function setStatusRow(id, ok) {
    var row = document.getElementById(id);
    if (!row) return;
    var span = row.querySelector('.st-wait') || row.querySelector('span:last-child');
    if (!span) return;
    span.className = ok ? 'st-ok' : 'st-bad';
    span.textContent = ok ? '● Normal' : '● Gagal';
  }
})();
