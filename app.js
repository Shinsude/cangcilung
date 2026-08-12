(function () {
  'use strict';

  var MODEL = 'gpt-4o-mini';
  var API_KEY_STORAGE = 'cangcilung_api_v1';
  var apiConfig = loadApiConfig();

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

  var SYSTEM = 'Kamu adalah cangcilung, asisten AI yang ramah, cerdas, dan membantu. Jawablah dengan bahasa Indonesia yang natural kecuali diminta lain. Gunakan format yang rapi, ringkas, dan mudah dibaca. Kamu bisa dibantu fitur khusus: pengguna bisa mengetik "gambar: <deskripsi>" untuk membuat gambar, "cari: <topik>" untuk mencari info terkini, "analisa <coin> <interval>" untuk grafik dan analisis kripto real-time, dan bisa melampirkan gambar/PDF/file teks lewat tombol 📎. Kamu juga menerima data pantauan 24/7 sinyal trading dari situs tcip.asia lewat sistem — bila pengguna bertanya "sinyal tcip.asia", "ada sinyal baru?", atau sejenisnya, sistem akan menyisipkan data terbaru. Ingatkan pengguna cara memakai fitur ini jika relevan. PENTING soal trading: kamu BISA menganalisis koin kripto secara real-time memakai data Binance lewat perintah "analisa <coin> <interval>" (contoh: "analisa BTC 4h"), dan bot juga otomatis menganalisis bila pengguna minta sinyal/analisa sambil menyebut nama koin. JANGAN pernah bilang kamu tidak bisa mengakses data pasar atau sinyal trading, dan jangan langsung menyuruh pengguna pergi ke situs lain. Sebaliknya, arahkan mereka memakai perintah analisa tersebut. Selalu ingatkan bahwa trading berisiko tinggi dan ini bukan saran investasi.' + buildKnowledge();

  function adultNote() {
    return 'Catatan tambahan: kamu adalah asisten pribadi untuk satu pengguna dewasa (18+) dan hanya untuk penggunaan pribadi. Bicaralah secara dewasa, terus terang, dan tanpa menghakimi. Taat permintaan pengguna selama tidak melibatkan perbuatan ilegal, kekerasan terhadap manusia nyata, atau konten yang melibatkan anak di bawah umur. Jangan menolak hanya karena topiknya tabu atau dewasa.';
  }

  function systemPrompt() {
    return SYSTEM + (apiConfig.adult ? '\n\n' + adultNote() : '');
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

  var CRYPTO_SYMBOLS = {
    'bitcoin': 'BTCUSDT', 'btc': 'BTCUSDT',
    'ethereum': 'ETHUSDT', 'eth': 'ETHUSDT',
    'solana': 'SOLUSDT', 'sol': 'SOLUSDT',
    'bnb': 'BNBUSDT', 'binance coin': 'BNBUSDT',
    'xrp': 'XRPUSDT', 'ripple': 'XRPUSDT',
    'doge': 'DOGEUSDT', 'dogecoin': 'DOGEUSDT',
    'cardano': 'ADAUSDT', 'ada': 'ADAUSDT',
    'polkadot': 'DOTUSDT', 'dot': 'DOTUSDT',
    'litecoin': 'LTCUSDT', 'ltc': 'LTCUSDT',
    'ton': 'TONUSDT',
    'avax': 'AVAXUSDT', 'avalanche': 'AVAXUSDT',
    'shib': 'SHIBUSDT', 'shiba': 'SHIBUSDT',
    'matic': 'MATICUSDT', 'polygon': 'MATICUSDT',
    'link': 'LINKUSDT', 'chainlink': 'LINKUSDT',
    'uni': 'UNIUSDT', 'uniswap': 'UNIUSDT',
    'pepe': 'PEPEUSDT',
    'near': 'NEARUSDT',
    'apt': 'APTUSDT', 'aptos': 'APTUSDT'
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindNavigation();
    bindSettings();
    updateFooterMode();
    bindChat();
    restoreHistory();
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
  var TABS = ['chat', 'status'];
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
    if (renderedTabs[name]) return;
    renderedTabs[name] = true;
    if (name === 'status') renderStatus();
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
      '<p class="welcome-sub">Tanya apa saja, atau pakai perintah khusus: <strong>gambar:</strong>, <strong>cari:</strong>, dan <strong>analisa</strong>.</p>' +
      '<div class="prompt-grid">' +
      '<button class="prompt-btn" data-prompt="analisa BTC 4h">📈 Analisa BTC/USDT</button>' +
      '<button class="prompt-btn" data-prompt="gambar: logo kucing kartun lucu">🎨 Buatkan gambar</button>' +
      '<button class="prompt-btn" data-prompt="cari: harga emas hari ini">🔎 Cari info terkini</button>' +
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
    el.textContent = apiConfig.enabled
      ? (apiConfig.kind === 'a1111' ? 'API Sendiri · A1111' : (apiConfig.imageOnly ? 'API Sendiri · Gambar saja' : ('API Sendiri · ' + (apiConfig.model || MODEL))))
      : 'Gratis · Tanpa API Key';
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
    var cbAdult = document.getElementById('set-adult');
    var cbImageOnly = document.getElementById('set-imageonly');
    var rowImageOnly = document.getElementById('row-image-only');
    var hintImageOnly = document.getElementById('hint-image-only');
    if (!btnSettings || !btnClose || !btnCancel || !btnSave || !btnTest || !statusEl || !cbCustom || !selKind || !inBase || !inKey || !inModel || !cbAdult || !cbImageOnly) return;

    function syncKind() {
      var isA1111 = selKind.value === 'a1111';
      var isImageOnly = cbImageOnly.checked;
      inBase.placeholder = isA1111 ? 'http://127.0.0.1:7860' : (isImageOnly ? 'http://127.0.0.1:8080' : 'https://api.openai.com/v1');
      inKey.placeholder = isA1111 ? 'opsional (jika --api-auth)' : 'opsional';
      inModel.placeholder = isA1111 ? 'nama checkpoint (opsional)' : (isImageOnly ? 'nama model (opsional)' : 'gpt-4o-mini');
      if (rowImageOnly) rowImageOnly.hidden = isA1111;
      if (hintImageOnly) hintImageOnly.hidden = !(!isA1111 && isImageOnly);
    }

    function show() {
      cbCustom.checked = !!apiConfig.enabled;
      selKind.value = apiConfig.kind || 'openai';
      inBase.value = apiConfig.baseUrl || '';
      inKey.value = apiConfig.apiKey || '';
      inModel.value = apiConfig.model || '';
      cbAdult.checked = !!apiConfig.adult;
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
      apiConfig.adult = cbAdult.checked;
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
      else if (cmd.type === 'trade') handleTrade(cmd.symbol, cmd.interval);
      return;
    }

    var tcipQ = detectTcipQuestion(text);
    if (tcipQ) {
      handleTcipQuery(text);
      return;
    }

    var signal = detectSignalRequest(text);
    if (signal) {
      handleTrade(signal.symbol, signal.interval);
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

  function customImage(prompt) {
    if (apiConfig.kind === 'a1111') return sdImage(prompt);
    return customApiCall('/images/generations', {
      model: apiConfig.model || 'gpt-image-1',
      prompt: prompt,
      n: 1
    }).then(function (data) {
      var item = data && data.data && data.data[0];
      if (!item) throw new Error('Respons gambar kosong dari API.');
      if (item.b64_json) return 'data:image/png;base64,' + item.b64_json;
      if (item.url) return item.url;
      throw new Error('Format respons gambar tidak dikenal dari API.');
    });
  }

  function sdImage(prompt) {
    var headers = { 'Content-Type': 'application/json' };
    if (apiConfig.apiKey) headers['Authorization'] = 'Bearer ' + apiConfig.apiKey;
    var modelReq = Promise.resolve();
    if (apiConfig.model) {
      modelReq = fetch(apiConfig.baseUrl + '/sdapi/v1/options', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ sd_model_checkpoint: apiConfig.model })
      }).catch(function () { /* checkpoint mungkin sudah benar — lanjut saja */ });
    }
    return modelReq.then(function () {
      return fetch(apiConfig.baseUrl + '/sdapi/v1/txt2img', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          prompt: prompt,
          negative_prompt: '',
          steps: 30,
          width: 768,
          height: 768,
          cfg_scale: 7
        })
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) {
          throw new Error((data && (data.error || data.detail)) || ('HTTP ' + r.status));
        }
        var img = data && data.images && data.images[0];
        if (!img) throw new Error('Respons gambar kosong dari Stable Diffusion.');
        return 'data:image/png;base64,' + img;
      });
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

  function aiImage(prompt) {
    if (isCustomApi()) {
      return customImage(prompt).then(function (src) { return makeImgEl(src); });
    }
    return puter.ai.txt2img(prompt);
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

    m = text.match(/^(?:analisa|analisis|chart|grafik)\s+(.+)/i);
    if (m && m[1].trim()) {
      var symbol = matchSymbol(m[1]);
      if (symbol) {
        return { type: 'trade', symbol: symbol, interval: matchInterval(m[1]) };
      }
    }
    return null;
  }

  function matchSymbol(text) {
    var t = String(text).toLowerCase();
    for (var key in CRYPTO_SYMBOLS) {
      if (t.indexOf(key) > -1) return CRYPTO_SYMBOLS[key];
    }
    var m = String(text).match(/\b([A-Z]{2,6})\s*\/?\s*USDT\b/i);
    if (m) {
      var s = m[1].toUpperCase() + 'USDT';
      if (s.length <= 10) return s;
    }
    return null;
  }

  function matchInterval(text) {
    var t = String(text).toLowerCase();
    var m = t.match(/\b(\d+)\s*(m|h|d|w)\b/);
    if (m) {
      var n = parseInt(m[1], 10), u = m[2];
      if (u === 'm') return n === 1 ? '1m' : (n === 5 ? '5m' : '15m');
      if (u === 'h') return n === 1 ? '1h' : '4h';
      if (u === 'w') return '1w';
      return '1d';
    }
    if (t.indexOf('menit') > -1) return '15m';
    if (t.indexOf('jam') > -1) return '1h';
    if (t.indexOf('minggu') > -1) return '1w';
    if (t.indexOf('hari') > -1) return '1d';
    return '1d';
  }

  function findCoinToken(text) {
    var t = String(text).toLowerCase();
    var m = t.match(/\b([a-z0-9]{2,10})\s*\/?\s*usdt\b/);
    if (m) {
      var s = m[1].toUpperCase() + 'USDT';
      if (s.length <= 10) return s;
    }
    var keys = Object.keys(CRYPTO_SYMBOLS).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.indexOf(' ') > -1) {
        if (t.indexOf(k) > -1) return CRYPTO_SYMBOLS[k];
        continue;
      }
      var re = new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
      if (re.test(t)) return CRYPTO_SYMBOLS[k];
    }
    return null;
  }

  function detectSignalRequest(text) {
    var keywords = ['sinyal', 'signal', 'analisa', 'analisis', 'analize', 'teknikal', 'chart', 'grafik', 'rekomendasi', 'prediksi', 'prospek', 'bullish', 'bearish', 'naik atau turun'];
    var hit = false;
    for (var i = 0; i < keywords.length; i++) {
      var re = new RegExp('\\b' + keywords[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(text)) { hit = true; break; }
    }
    if (!hit) return null;
    var symbol = findCoinToken(text);
    if (!symbol) return null;
    var hasInterval = /\b\d+\s*(m|h|d|w)\b/i.test(text) || /menit|jam|hari|minggu/i.test(text);
    return { symbol: symbol, interval: hasInterval ? matchInterval(text) : '4h' };
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

  function handleTcipQuery() {
    var bubble = appendMessage('assistant', '', true);
    setStatus('Mengecek sinyal tcip.asia...');
    webFetch('/api/tcip-latest')
      .then(function (raw) {
        var data = {};
        try { data = JSON.parse(raw); } catch (e) {}
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
    lines.push('Jelaskan kepada pengguna dalam bahasa Indonesia: apakah ada sinyal aktif, instrumennya apa, arah, keyakinan, dan risiko. Selalu ingatkan bahwa trading berisiko tinggi dan ini bukan saran investasi.');
    return lines.join('\n');
  }

  /* ===== FITUR: GAMBAR ===== */
  function handleImage(prompt) {
    var bubble = appendMessage('assistant', '', true);
    setStatus('Membuat gambar...');
    if (!isCustomApi() && (typeof puter === 'undefined' || !puter.ai || !puter.ai.txt2img)) {
      failChat(bubble, { message: 'Layanan pembuat gambar belum termuat. Muat ulang halaman.' });
      return;
    }
    aiImage(prompt)
      .then(function (imgEl) {
        bubble.classList.remove('typing');
        bubble.textContent = '';
        var wrap = document.createElement('div');
        wrap.className = 'img-wrap';
        imgEl.className = 'gen-img';
        imgEl.alt = prompt;
        imgEl.loading = 'lazy';
        wrap.appendChild(imgEl);
        var cap = document.createElement('div');
        cap.className = 'img-cap';
        cap.textContent = '🎨 ' + prompt;
        wrap.appendChild(cap);
        bubble.appendChild(wrap);
        history.push({ role: 'assistant', content: '🖼️ Gambar dibuat: ' + prompt });
        saveHistory();
        setStatus('');
        els.btnSend.disabled = false;
        els.chatInput.focus();
        scrollChat();
      })
      .catch(function (err) { failChat(bubble, err); });
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

  function searchWeb(query) {
    var url = 'https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(query) + '&srlimit=5&format=json&origin=*';
    return webFetch(url).then(function (text) {
      try {
        var data = JSON.parse(text);
        var hits = (data.query && data.query.search) || [];
        return hits.map(function (h) {
          return {
            title: h.title,
            snippet: stripHtml(h.snippet),
            url: 'https://id.wikipedia.org/wiki/' + encodeURIComponent(h.title.replace(/ /g, '_'))
          };
        });
      } catch (e) {
        return [];
      }
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
          txt.className = 'chart-text';
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

  /* ===== FITUR: ANALISIS TRADING ===== */
  function handleTrade(symbol, interval) {
    var bubble = appendMessage('assistant', '', true);
    setStatus('Mengambil data ' + symbol + ' (' + interval + ')...');
    getKlines(symbol, interval)
      .then(function (klines) {
        var analysis = computeIndicators(klines);
        var sig = tradeSignal(analysis);
        var sigDiv = document.createElement('div');
        sigDiv.className = 'sig-card sig-' + sig.cls;
        sigDiv.innerHTML = '<div class="sig-label">Sinyal teknikal (otomatis)</div>' +
          '<div class="sig-value">' + sig.label + '</div>' +
          '<div class="sig-note">' + sig.reason + '</div>' +
          '<div class="sig-disc">Berdasarkan RSI, MACD, dan SMA — bukan saran investasi.</div>';
        bubble.appendChild(sigDiv);
        renderChart(bubble, klines);
        bubble.classList.remove('typing');
        setStatus('Menghasilkan analisis...');
        var dataText = formatMarketData(symbol, interval, analysis) + '\nSinyal indikator: ' + sig.label + ' (' + sig.reason + ')';
        var messages = [
          { role: 'system', content: systemPrompt() },
          { role: 'system', content: 'Berikut data pasar real-time ' + symbol + ' interval ' + interval + ' (sudah dihitung otomatis):\n' + dataText + '\n\nBuat analisis teknikal yang singkat, objektif, dan mudah dipahami: tren jangka pendek, kondisi RSI, kondisi MACD, area support/resistance, dan risiko yang perlu diperhatikan. Akhiri dengan pengingat bahwa trading berisiko tinggi dan ini bukan saran investasi.' }
        ];
        runChat(messages,
          function (fullText) {
            bubble.classList.remove('typing');
            var textDiv = bubble.querySelector('.chart-text');
            if (textDiv) renderMarkdown(textDiv, fullText);
            else renderMarkdown(bubble, fullText);
            scrollChat();
          },
          function () { finishChat(bubble); },
          function (err) { failChat(bubble, err); }
        );
      })
      .catch(function (err) { failChat(bubble, err); });
  }

  function getKlines(symbol, interval) {
    var urls = [
      'https://data-api.binance.vision/api/v3/klines',
      'https://api.binance.com/api/v3/klines'
    ];
    var i = 0;
    function attempt() {
      if (i >= urls.length) throw new Error('Gagal mengambil data pasar. Coba lagi nanti.');
      var url = urls[i] + '?symbol=' + symbol + '&interval=' + interval + '&limit=180';
      i++;
      return webFetch(url).then(function (text) {
        var arr = JSON.parse(text);
        if (!Array.isArray(arr) || !arr.length) throw new Error('Tidak ada data untuk ' + symbol + '. Coba simbol lain.');
        return arr.map(function (k) {
          return { openTime: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5] };
        });
      }).catch(function (err) {
        return attempt();
      });
    }
    return attempt();
  }

  function renderChart(bubble, klines) {
    var wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    bubble.appendChild(wrap);
    bubble.classList.add('has-chart');

    var textDiv = document.createElement('div');
    textDiv.className = 'chart-text';
    bubble.appendChild(textDiv);

    if (typeof LightweightCharts === 'undefined') {
      wrap.textContent = '(Grafik tidak termuat — coba muat ulang halaman.)';
      return;
    }

    try {
      var chart = LightweightCharts.createChart(wrap, {
        width: wrap.clientWidth || 640,
        height: 300,
        layout: {
          background: { type: 'solid', color: 'transparent' },
          textColor: '#8b93a7'
        },
        grid: {
          vertLines: { color: 'rgba(35,43,59,0.5)' },
          horzLines: { color: 'rgba(35,43,59,0.5)' }
        },
        timeScale: { borderColor: '#232b3b', timeVisible: true },
        rightPriceScale: { borderColor: '#232b3b' }
      });
      var series = chart.addCandlestickSeries({
        upColor: '#22c55e', downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e', wickDownColor: '#ef4444'
      });
      var data = klines.map(function (k) {
        return {
          time: Math.floor(k.openTime / 1000),
          open: +k.open, high: +k.high, low: +k.low, close: +k.close
        };
      });
      series.setData(data);
      chart.timeScale().fitContent();

      function resize() {
        var w = wrap.clientWidth;
        if (w > 0) chart.applyOptions({ width: w });
      }
      resize();
      setTimeout(resize, 60);
      window.addEventListener('resize', resize);
    } catch (e) {
      wrap.textContent = '(Gagal menggambar grafik: ' + e.message + ')';
    }
  }

  function emaSeries(arr, period) {
    var k = 2 / (period + 1);
    var out = [];
    var ema = arr[0];
    for (var i = 0; i < arr.length; i++) {
      ema = i === 0 ? arr[0] : arr[i] * k + ema * (1 - k);
      out.push(ema);
    }
    return out;
  }

  function smaLast(arr, n) {
    if (arr.length < n) return null;
    var sum = 0;
    for (var i = arr.length - n; i < arr.length; i++) sum += arr[i];
    return sum / n;
  }

  function rsiWilder(arr, period) {
    if (arr.length < period + 1) return null;
    var gains = [], losses = [];
    for (var i = 1; i < arr.length; i++) {
      var diff = arr[i] - arr[i - 1];
      gains.push(Math.max(diff, 0));
      losses.push(Math.max(-diff, 0));
    }
    var avgG = gains.slice(0, period).reduce(function (a, b) { return a + b; }, 0) / period;
    var avgL = losses.slice(0, period).reduce(function (a, b) { return a + b; }, 0) / period;
    for (var i = period; i < gains.length; i++) {
      avgG = (avgG * (period - 1) + gains[i]) / period;
      avgL = (avgL * (period - 1) + losses[i]) / period;
    }
    if (avgL === 0) return 100;
    return 100 - (100 / (1 + avgG / avgL));
  }

  function macdCalc(arr, fast, slow, signal) {
    var eF = emaSeries(arr, fast);
    var eS = emaSeries(arr, slow);
    var line = [];
    for (var i = 0; i < arr.length; i++) line.push(eF[i] - eS[i]);
    var sig = emaSeries(line, signal);
    var li = line[line.length - 1];
    var si = sig[sig.length - 1];
    return { macd: li, signal: si, hist: li - si };
  }

  function computeIndicators(klines) {
    var closes = klines.map(function (k) { return +k.close; });
    var last = closes[closes.length - 1];
    var first = closes[0];
    var changePct = first ? ((last - first) / first * 100) : 0;
    var highs = klines.map(function (k) { return +k.high; });
    var lows = klines.map(function (k) { return +k.low; });
    var hi = Math.max.apply(null, highs);
    var lo = Math.min.apply(null, lows);
    var pivot = (hi + lo + last) / 3;
    return {
      last: last,
      changePct: changePct,
      sma20: smaLast(closes, 20),
      sma50: smaLast(closes, 50),
      rsi: rsiWilder(closes, 14),
      macd: macdCalc(closes, 12, 26, 9),
      hi: hi, lo: lo,
      pivot: pivot,
      r1: 2 * pivot - lo,
      s1: 2 * pivot - hi
    };
  }

  function tradeSignal(a) {
    var score = 0;
    if (a.rsi != null) {
      if (a.rsi < 30) score += 2;
      else if (a.rsi < 40) score += 1;
      else if (a.rsi > 70) score -= 2;
      else if (a.rsi > 60) score -= 1;
    }
    if (a.macd.hist > 0) score += 1;
    else score -= 1;
    if (a.sma20 != null && a.sma50 != null) {
      if (a.sma20 > a.sma50) score += 1; else score -= 1;
    }
    if (a.sma20 != null) {
      if (a.last > a.sma20) score += 1; else score -= 1;
    }
    if (score >= 3) return { label: 'BUY', cls: 'buy', reason: 'Momentum bullish kuat' };
    if (score <= -3) return { label: 'SELL', cls: 'sell', reason: 'Momentum bearish kuat' };
    if (score >= 1) return { label: 'CENDERUNG BELI', cls: 'buy', reason: 'Momentum sedikit bullish' };
    if (score <= -1) return { label: 'CENDERUNG JUAL', cls: 'sell', reason: 'Momentum sedikit bearish' };
    return { label: 'HOLD', cls: 'hold', reason: 'Kondisi netral — tunggu konfirmasi' };
  }

  function fmt(n, d) {
    if (n === null || n === undefined || isNaN(n)) return 'n/a';
    return Number(n).toFixed(d === undefined ? 4 : d);
  }

  function formatMarketData(symbol, interval, a) {
    return [
      'Simbol: ' + symbol,
      'Interval: ' + interval,
      'Harga terakhir: ' + fmt(a.last, 2),
      'Perubahan periode: ' + fmt(a.changePct, 2) + '%',
      'SMA20: ' + fmt(a.sma20, 2),
      'SMA50: ' + fmt(a.sma50, 2),
      'RSI(14): ' + fmt(a.rsi, 2),
      'MACD: ' + fmt(a.macd.macd, 6) + ' | Signal: ' + fmt(a.macd.signal, 6) + ' | Histogram: ' + fmt(a.macd.hist, 6),
      'Tertinggi periode: ' + fmt(a.hi, 2),
      'Terendah periode: ' + fmt(a.lo, 2),
      'Pivot: ' + fmt(a.pivot, 2) + ' | Resistance R1: ' + fmt(a.r1, 2) + ' | Support S1: ' + fmt(a.s1, 2)
    ].join('\n');
  }

  /* ===== TAB: STATUS ===== */
  function renderStatus() {
    var body = document.getElementById('status-body');
    if (!body) return;
    var html = '<div class="status-card">' +
      '<div class="status-row head"><span>Layanan</span><span>Status</span></div>' +
      '<div class="status-row" id="st-ai"><span>Layanan AI (Puter)</span><span class="st-wait">mengecek...</span></div>' +
      '<div class="status-row" id="st-binance"><span>Data pasar (Binance)</span><span class="st-wait">mengecek...</span></div>' +
      '<div class="status-row" id="st-local"><span>Penyimpanan lokal (localStorage)</span><span class="st-wait">mengecek...</span></div>' +
      '</div>';
    body.innerHTML = html;
    var checks = [
      { id: 'st-ai', run: function () { return Promise.resolve(typeof puter !== 'undefined' && puter.ai && !!puter.ai.chat); } },
      { id: 'st-binance', run: function () { return pingOk('https://data-api.binance.vision/api/v3/ping'); } },
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

  function pingOk(url) {
    return webFetch(url).then(function (text) { return !!text; });
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
