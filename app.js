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
        adult: !!c.adult
      };
    } catch (e) { return {}; }
  }

  var SYSTEM = 'Kamu adalah cangcilung, asisten AI yang ramah, cerdas, dan membantu. Jawablah dengan bahasa Indonesia yang natural kecuali diminta lain. Gunakan format yang rapi, ringkas, dan mudah dibaca. Kamu juga bisa dibantu fitur khusus: pengguna bisa mengetik "gambar: <deskripsi>" untuk membuat gambar, "cari: <topik>" untuk mencari info terkini, "analisa <coin> <interval>" untuk grafik dan analisis kripto real-time, dan bisa melampirkan gambar/PDF/file teks lewat tombol 📎. Ingatkan pengguna cara memakai fitur ini jika relevan.' + buildKnowledge();

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

  var COINS = [
    { id: 'bitcoin', sym: 'BTC', name: 'Bitcoin', icon: '₿' },
    { id: 'ethereum', sym: 'ETH', name: 'Ethereum', icon: 'Ξ' },
    { id: 'binancecoin', sym: 'BNB', name: 'BNB', icon: '⬡' },
    { id: 'solana', sym: 'SOL', name: 'Solana', icon: '◎' },
    { id: 'ripple', sym: 'XRP', name: 'XRP', icon: '✕' },
    { id: 'cardano', sym: 'ADA', name: 'Cardano', icon: '₳' },
    { id: 'dogecoin', sym: 'DOGE', name: 'Dogecoin', icon: 'Ð' },
    { id: 'polkadot', sym: 'DOT', name: 'Polkadot', icon: '◉' },
    { id: 'litecoin', sym: 'LTC', name: 'Litecoin', icon: 'Ł' },
    { id: 'avalanche-2', sym: 'AVAX', name: 'Avalanche', icon: '▲' },
    { id: 'matic-network', sym: 'MATIC', name: 'Polygon', icon: '⬢' },
    { id: 'chainlink', sym: 'LINK', name: 'Chainlink', icon: '⛓' },
    { id: 'the-open-network', sym: 'TON', name: 'Toncoin', icon: '◈' },
    { id: 'shiba-inu', sym: 'SHIB', name: 'Shiba Inu', icon: '🐕' },
    { id: 'pepe', sym: 'PEPE', name: 'Pepe', icon: '🐸' },
    { id: 'near', sym: 'NEAR', name: 'NEAR', icon: '⛩' },
    { id: 'aptos', sym: 'APT', name: 'Aptos', icon: '🅰' }
  ];

  var SYMBOL_TO_ID = {};
  COINS.forEach(function (c) { SYMBOL_TO_ID[c.sym] = c.id; });

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindNavigation();
    bindSignal();
    bindPnl();
    bindMarketRefresh();
    bindCalendarRefresh();
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
  var TABS = ['chat', 'market', 'signal', 'pnl', 'calendar', 'status'];
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
    if (name === 'market') renderMarket();
    else if (name === 'calendar') renderCalendar();
    else if (name === 'status') renderStatus();
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

  function fmtPrice(n) {
    n = Number(n);
    if (isNaN(n)) return 'n/a';
    if (n >= 1000) return n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(2);
    if (n >= 0.01) return n.toFixed(4);
    return n.toFixed(8);
  }

  function paneLoading(msg) {
    return '<div class="pane-state"><span class="spinner"></span><span>' + escHtml(msg) + '</span></div>';
  }

  function paneEmpty(msg) {
    return '<div class="pane-state"><span>📭</span><span>' + escHtml(msg) + '</span></div>';
  }

  function paneError(msg) {
    return '<div class="pane-state error"><span>⚠️</span><span>' + escHtml(msg) + '</span></div>';
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
      ? (apiConfig.kind === 'a1111' ? 'API Sendiri · A1111' : ('API Sendiri · ' + (apiConfig.model || MODEL)))
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
    if (!btnSettings || !btnClose || !btnCancel || !btnSave || !btnTest || !statusEl || !cbCustom || !selKind || !inBase || !inKey || !inModel || !cbAdult) return;

    function syncKind() {
      inBase.placeholder = selKind.value === 'a1111' ? 'http://127.0.0.1:7860' : 'https://api.openai.com/v1';
      inKey.placeholder = selKind.value === 'a1111' ? 'opsional (jika --api-auth)' : 'sk-...';
      inModel.placeholder = selKind.value === 'a1111' ? 'nama checkpoint (opsional)' : 'gpt-4o-mini';
    }

    function show() {
      cbCustom.checked = !!apiConfig.enabled;
      selKind.value = apiConfig.kind || 'openai';
      inBase.value = apiConfig.baseUrl || '';
      inKey.value = apiConfig.apiKey || '';
      inModel.value = apiConfig.model || '';
      cbAdult.checked = !!apiConfig.adult;
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
    modal.addEventListener('click', function (e) { if (e.target === modal) hide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) hide(); });

    btnSave.addEventListener('click', function () {
      apiConfig.enabled = cbCustom.checked;
      apiConfig.kind = selKind.value === 'a1111' ? 'a1111' : 'openai';
      apiConfig.baseUrl = inBase.value.trim().replace(/\/+$/, '');
      apiConfig.apiKey = inKey.value.trim();
      apiConfig.model = inModel.value.trim();
      apiConfig.adult = cbAdult.checked;
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
        model: inModel.value.trim() || MODEL
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
    return !!apiConfig.apiKey;
  }

  function customApiCall(path, body, cfg) {
    cfg = cfg || apiConfig;
    return fetch(cfg.baseUrl + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
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
    if (isCustomApi() && apiConfig.kind !== 'a1111') {
      return customVision(prompt, dataUrl);
    }
    return puter.ai.chat(prompt, dataUrl, { model: MODEL });
  }

  function runChat(messages, onToken, onDone, onError) {
    if (isCustomApi() && apiConfig.kind !== 'a1111') {
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
        renderChart(bubble, klines);
        bubble.classList.remove('typing');
        setStatus('Menghasilkan analisis...');
        var dataText = formatMarketData(symbol, interval, analysis);
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

  /* ===== TAB: PASAR ===== */
  function bindMarketRefresh() {
    var btn = document.getElementById('btn-market-refresh');
    if (btn) btn.addEventListener('click', renderMarket);
  }

  function renderMarket() {
    var body = document.getElementById('market-body');
    if (!body) return;
    body.innerHTML = paneLoading('Memuat harga pasar...');
    var ids = COINS.map(function (c) { return c.id; }).join(',');
    var url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true';
    webFetch(url)
      .then(function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { throw new Error('Respons pasar tidak valid.'); }
        var rows = COINS.map(function (c) {
          var d = data[c.id] || {};
          return { coin: c, price: d.usd, chg: d.usd_24h_change };
        }).filter(function (r) { return r.price != null; })
          .sort(function (a, b) { return b.price - a.price; });
        if (!rows.length) throw new Error('Tidak ada data pasar. Coba lagi nanti.');
        var html = '<div class="mkt-table">' +
          '<div class="mkt-row mkt-head"><div class="mkt-name">Koin</div><div class="mkt-price">Harga (USD)</div><div class="mkt-chg">24 jam</div></div>';
        rows.forEach(function (r) {
          var cls = r.chg >= 0 ? 'up' : 'down';
          var sign = r.chg >= 0 ? '+' : '';
          html += '<div class="mkt-row">' +
            '<div class="mkt-name"><span class="mkt-icon">' + r.coin.icon + '</span>' +
            '<span class="mkt-sym">' + r.coin.sym + '</span>' +
            '<span class="mkt-full">' + escHtml(r.coin.name) + '</span></div>' +
            '<div class="mkt-price">$' + fmtPrice(r.price) + '</div>' +
            '<div class="mkt-chg ' + cls + '">' + sign + fmt(r.chg, 2) + '%</div>' +
            '</div>';
        });
        html += '</div>';
        html += '<div class="mkt-note">Sumber: CoinGecko · diperbarui ' + new Date().toLocaleTimeString('id-ID') + '</div>';
        body.innerHTML = html;
      })
      .catch(function (err) {
        body.innerHTML = paneError(friendlyError(err));
      });
  }

  /* ===== TAB: SIGNAL ===== */
  function bindSignal() {
    var btn = document.getElementById('btn-signal');
    if (!btn) return;
    btn.addEventListener('click', function () { runSignal(); });
    var input = document.getElementById('signal-symbol');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runSignal(); }
    });
  }

  function resolveSymbol(raw) {
    var t = String(raw || '').trim().toUpperCase();
    if (!t) return null;
    if (CRYPTO_SYMBOLS[t.toLowerCase()]) return CRYPTO_SYMBOLS[t.toLowerCase()];
    if (SYMBOL_TO_ID[t]) return t + 'USDT';
    var m = t.match(/^([A-Z]{1,6})$/);
    if (m) return m[1] + 'USDT';
    return null;
  }

  function runSignal() {
    var body = document.getElementById('signal-result');
    var raw = document.getElementById('signal-symbol').value;
    var interval = document.getElementById('signal-interval').value;
    var symbol = resolveSymbol(raw);
    if (!symbol) {
      body.innerHTML = paneError('Simbol tidak dikenal. Contoh: BTC, ETH, SOL.');
      return;
    }
    body.innerHTML = paneLoading('Menghitung indikator & tren ' + symbol + ' (' + interval + ')...');
    getKlines(symbol, interval)
      .then(function (klines) {
        var a = computeIndicators(klines);
        var trend = linearTrend(klines);
        var sig = makeSignal(a, trend);
        var points = klines.map(function (k) {
          return { time: Math.floor(k.openTime / 1000), close: +k.close };
        });
        body.innerHTML = signalCardHTML(symbol, interval, a, trend, sig);
        renderLineChart('signal-chart', points);
      })
      .catch(function (err) {
        body.innerHTML = paneError(friendlyError(err));
      });
  }

  function linearTrend(klines) {
    var n = klines.length;
    if (n < 2) return null;
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var i = 0; i < n; i++) {
      var y = +klines[i].close;
      sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i;
    }
    var denom = n * sumX2 - sumX * sumX;
    if (!denom) return null;
    var slope = (n * sumXY - sumX * sumY) / denom;
    var intercept = (sumY - slope * sumX) / n;
    var last = +klines[n - 1].close;
    var projected = slope * n + intercept;
    var direction = projected > last ? 'up' : (projected < last ? 'down' : 'sideways');
    var bias = slope > 0 ? 'Bullish' : (slope < 0 ? 'Bearish' : 'Netral');
    var strength = Math.abs(slope) / (last || 1) * n * 100;
    return { slope: slope, direction: direction, bias: bias, strength: strength };
  }

  function makeSignal(a, trend) {
    var score = 0;
    var reasons = [];
    if (a.rsi != null) {
      if (a.rsi > 70) { score -= 2; reasons.push('RSI jenuh beli (overbought): ' + fmt(a.rsi, 0)); }
      else if (a.rsi < 30) { score += 2; reasons.push('RSI jenuh jual (oversold): ' + fmt(a.rsi, 0)); }
      else if (a.rsi >= 50) { score += 1; reasons.push('RSI netral-positif: ' + fmt(a.rsi, 0)); }
      else { score -= 1; reasons.push('RSI netral-negatif: ' + fmt(a.rsi, 0)); }
    }
    if (a.macd) {
      if (a.macd.macd >= a.macd.signal) { score += 1; reasons.push('MACD di atas garis signal (bullish)'); }
      else { score -= 1; reasons.push('MACD di bawah garis signal (bearish)'); }
      if (a.macd.hist >= 0) { score += 0.5; reasons.push('Histogram MACD positif'); }
      else { score -= 0.5; reasons.push('Histogram MACD negatif'); }
    }
    if (a.sma20 != null && a.sma50 != null) {
      if (a.last > a.sma20 && a.sma20 > a.sma50) { score += 1.5; reasons.push('Harga di atas SMA20 & SMA50 (uptrend)'); }
      else if (a.last < a.sma20 && a.sma20 < a.sma50) { score -= 1.5; reasons.push('Harga di bawah SMA20 & SMA50 (downtrend)'); }
      else if (a.last > a.sma20) { score += 0.5; reasons.push('Harga di atas SMA20'); }
      else { score -= 0.5; reasons.push('Harga di bawah SMA20'); }
    }
    if (trend) {
      if (trend.bias === 'Bullish') { score += 1; reasons.push('Tren linier naik'); }
      else if (trend.bias === 'Bearish') { score -= 1; reasons.push('Tren linier turun'); }
    }
    var label, cls;
    if (score >= 3) { label = 'STRONG BUY'; cls = 'buy'; }
    else if (score >= 1) { label = 'BUY'; cls = 'buy'; }
    else if (score <= -3) { label = 'STRONG SELL'; cls = 'sell'; }
    else if (score <= -1) { label = 'SELL'; cls = 'sell'; }
    else { label = 'HOLD / NETRAL'; cls = 'hold'; }
    return { score: score, label: label, cls: cls, reasons: reasons };
  }

  function signalCardHTML(symbol, interval, a, trend, sig) {
    var html = '<div class="signal-card">' +
      '<div class="signal-top"><div><span class="signal-sym">' + escHtml(symbol) + '</span><span class="signal-int">' + escHtml(interval) + '</span></div>' +
      '<span class="signal-badge ' + sig.cls + '">' + escHtml(sig.label) + '</span></div>' +
      '<div class="signal-chart" id="signal-chart"></div>' +
      '<div class="signal-grid">' +
      signalCell('Harga', '$' + fmtPrice(a.last)) +
      signalCell('Perubahan', fmt(a.changePct, 2) + '%') +
      signalCell('RSI(14)', fmt(a.rsi, 2)) +
      signalCell('MACD', fmt(a.macd.macd, 6)) +
      signalCell('SMA20', '$' + fmt(a.sma20, 2)) +
      signalCell('SMA50', '$' + fmt(a.sma50, 2)) +
      signalCell('Pivot', '$' + fmt(a.pivot, 2)) +
      signalCell('R1', '$' + fmt(a.r1, 2)) +
      signalCell('S1', '$' + fmt(a.s1, 2)) +
      '</div>';
    if (trend) {
      html += '<div class="signal-trend">Tren Machine Learning: <b>' + escHtml(trend.bias) + '</b> · proyeksi ' + (trend.direction === 'up' ? 'naik' : trend.direction === 'down' ? 'turun' : 'datar') +
        ' · kekuatan ' + fmt(trend.strength, 2) + '%</div>';
    }
    if (sig.reasons.length) {
      html += '<ul class="signal-reasons">';
      sig.reasons.forEach(function (r) { html += '<li>' + escHtml(r) + '</li>'; });
      html += '</ul>';
    }
    html += '<div class="signal-disc">⚠️ Hanya informasi, bukan saran investasi. Trading berisiko tinggi.</div></div>';
    return html;
  }

  function signalCell(label, value) {
    return '<div class="signal-cell"><span class="signal-label">' + label + '</span><span class="signal-value">' + value + '</span></div>';
  }

  function renderLineChart(elId, points) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (typeof LightweightCharts === 'undefined') {
      el.textContent = '(Grafik tidak termuat)';
      return;
    }
    try {
      var chart = LightweightCharts.createChart(el, {
        width: el.clientWidth || 600,
        height: 240,
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#8b93a7' },
        grid: { vertLines: { color: 'rgba(35,43,59,0.5)' }, horzLines: { color: 'rgba(35,43,59,0.5)' } },
        timeScale: { borderColor: '#232b3b', timeVisible: true },
        rightPriceScale: { borderColor: '#232b3b' }
      });
      var series = chart.addLineSeries({ color: '#7c3aed', lineWidth: 2 });
      series.setData(points);
      chart.timeScale().fitContent();
      function resize() {
        var w = el.clientWidth;
        if (w > 0) chart.applyOptions({ width: w });
      }
      resize();
      setTimeout(resize, 60);
      window.addEventListener('resize', resize);
    } catch (e) {
      el.textContent = '(Gagal menggambar grafik)';
    }
  }

  /* ===== TAB: P&L ===== */
  var PNL_KEY = 'cangcilung_pnl_v1';

  function bindPnl() {
    var btn = document.getElementById('btn-pnl-add');
    if (!btn) return;
    btn.addEventListener('click', addPnl);
    var qty = document.getElementById('pnl-qty');
    qty.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addPnl(); }
    });
    document.addEventListener('click', function (e) {
      var del = e.target.closest('.pnl-del');
      if (!del) return;
      var id = del.getAttribute('data-id');
      var arr = loadPnl().filter(function (p) { return p.id !== id; });
      savePnl(arr);
      renderPnl();
    });
  }

  function loadPnl() {
    try {
      var raw = localStorage.getItem(PNL_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function savePnl(arr) {
    try { localStorage.setItem(PNL_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function addPnl() {
    var sym = document.getElementById('pnl-symbol').value.trim().toUpperCase();
    var entry = parseFloat(document.getElementById('pnl-entry').value);
    var qty = parseFloat(document.getElementById('pnl-qty').value);
    var summary = document.getElementById('pnl-summary');
    if (!resolveSymbol(sym)) { summary.innerHTML = paneError('Simbol tidak dikenal. Contoh: BTC.'); return; }
    if (!(entry > 0) || !(qty > 0)) { summary.innerHTML = paneError('Isi harga beli dan jumlah yang valid.'); return; }
    var arr = loadPnl();
    arr.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), symbol: sym, entry: entry, qty: qty, added: Date.now() });
    savePnl(arr);
    document.getElementById('pnl-entry').value = '';
    document.getElementById('pnl-qty').value = '';
    renderPnl();
  }

  function renderPnl() {
    var summary = document.getElementById('pnl-summary');
    var list = document.getElementById('pnl-list');
    var arr = loadPnl();
    if (!arr.length) {
      summary.innerHTML = '';
      list.innerHTML = paneEmpty('Belum ada posisi. Tambahkan koin yang kamu beli pada form di atas.');
      return;
    }
    var ids = arr.map(function (p) { return SYMBOL_TO_ID[p.symbol] || p.symbol.toLowerCase(); }).join(',');
    summary.innerHTML = paneLoading('Mengambil harga terkini...');
    webFetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd')
      .then(function (text) {
        var data = {};
        try { data = JSON.parse(text); } catch (e) {}
        var rows = arr.map(function (p) {
          var id = SYMBOL_TO_ID[p.symbol] || p.symbol.toLowerCase();
          var cur = data[id] && data[id].usd;
          var cost = p.entry * p.qty;
          var value = cur != null ? cur * p.qty : null;
          var pnl = value != null ? value - cost : null;
          var pct = (cost > 0 && pnl != null) ? (pnl / cost * 100) : null;
          return { pos: p, cur: cur, cost: cost, value: value, pnl: pnl, pct: pct };
        });
        var totalCost = rows.reduce(function (s, r) { return s + r.cost; }, 0);
        var totalValue = rows.reduce(function (s, r) { return s + (r.value != null ? r.value : 0); }, 0);
        var totalPnl = totalValue - totalCost;
        var totalPct = totalCost > 0 ? (totalPnl / totalCost * 100) : 0;
        summary.innerHTML = renderPnlSummary(totalPnl, totalPct, totalValue);
        list.innerHTML = renderPnlList(rows);
      })
      .catch(function () {
        var rows = arr.map(function (p) {
          var cost = p.entry * p.qty;
          return { pos: p, cur: null, cost: cost, value: null, pnl: null, pct: null };
        });
        summary.innerHTML = paneError('Gagal mengambil harga terkini. Tampil nilai berdasarkan harga beli.');
        list.innerHTML = renderPnlList(rows);
      });
  }

  function renderPnlSummary(totalPnl, totalPct, totalValue) {
    var cls = totalPnl > 0 ? 'up' : (totalPnl < 0 ? 'down' : 'flat');
    var sign = totalPnl > 0 ? '+' : '';
    return '<div class="pnl-total ' + cls + '">' +
      '<div class="pnl-total-label">Total P&amp;L</div>' +
      '<div class="pnl-total-val">' + sign + '$' + fmtPrice(Math.abs(totalPnl)) + '</div>' +
      '<div class="pnl-total-pct">' + sign + fmt(totalPct, 2) + '%</div>' +
      '<div class="pnl-total-note">Nilai total: $' + fmtPrice(totalValue) + '</div>' +
      '</div>';
  }

  function renderPnlList(rows) {
    var html = '<div class="pnl-table">' +
      '<div class="pnl-row pnl-head"><div class="pnl-sym">Koin</div><div class="pnl-num">Beli</div><div class="pnl-num">Jumlah</div><div class="pnl-num">Sekarang</div><div class="pnl-num">P&amp;L</div><div class="pnl-act"></div></div>';
    rows.forEach(function (r) {
      var pnlTxt = r.pnl == null ? 'n/a' : (r.pnl >= 0 ? '+' : '') + '$' + fmtPrice(Math.abs(r.pnl));
      var pctTxt = r.pct == null ? '' : ' (' + (r.pct >= 0 ? '+' : '') + fmt(r.pct, 2) + '%)';
      var cls = r.pnl == null ? 'flat' : (r.pnl > 0 ? 'up' : 'down');
      html += '<div class="pnl-row">' +
        '<div class="pnl-sym">' + escHtml(r.pos.symbol) + '</div>' +
        '<div class="pnl-num">$' + fmtPrice(r.pos.entry) + '</div>' +
        '<div class="pnl-num">' + r.pos.qty + '</div>' +
        '<div class="pnl-num">' + (r.cur != null ? '$' + fmtPrice(r.cur) : 'n/a') + '</div>' +
        '<div class="pnl-num ' + cls + '">' + pnlTxt + pctTxt + '</div>' +
        '<div class="pnl-act"><button class="pnl-del" data-id="' + escHtml(r.pos.id) + '" title="Hapus posisi">✕</button></div>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  /* ===== TAB: KALENDER ===== */
  function bindCalendarRefresh() {
    var btn = document.getElementById('btn-calendar-refresh');
    if (btn) btn.addEventListener('click', renderCalendar);
  }

  function renderCalendar() {
    var body = document.getElementById('calendar-body');
    if (!body) return;
    body.innerHTML = paneLoading('Memuat kalender ekonomi...');
    var now = Date.now();
    var payload = { filter: [], from: now - 86400000, to: now + 7 * 86400000, limit: 40, type: 'economic' };
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };
    webFetch('https://economic-calendar.tradingview.com/events', opts)
      .then(function (text) { return parseCalendar(text); })
      .then(renderCalendarList)
      .catch(function () {
        return webFetch('https://economic-calendar.tradingview.com/events')
          .then(function (text) { return parseCalendar(text); })
          .then(renderCalendarList);
      })
      .then(function (html) { body.innerHTML = html; })
      .catch(function (err) {
        body.innerHTML = paneError(friendlyError(err) + ' Coba tekan tombol Muat ulang.');
      });
  }

  function parseCalendar(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Respons kalender tidak valid.'); }
    var evs = Array.isArray(data) ? data : (data && data.result);
    if (!Array.isArray(evs) || !evs.length) throw new Error('Tidak ada event ekonomi di rentang waktu ini.');
    return evs;
  }

  function renderCalendarList(evs) {
    var sorted = evs.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var html = '<div class="cal-list">';
    sorted.forEach(function (ev) {
      var d = new Date(ev.date);
      html += '<div class="cal-item">' +
        '<div class="cal-date"><div class="cal-day">' + d.getDate() + '</div><div class="cal-month">' + d.toLocaleString('id-ID', { month: 'short' }) + '</div></div>' +
        '<div class="cal-main"><div class="cal-title">' + flagEmoji(ev.country) + ' ' + escHtml(ev.title) + '</div>' +
        '<div class="cal-meta"><span class="cal-time">' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
        impactBadge(ev.importance) +
        calVal('Sebelumnya', ev.previous) +
        calVal('Forecast', ev.forecast) +
        calVal('Aktual', ev.actual) +
        '</div></div></div>';
    });
    html += '</div>';
    html += '<div class="mkt-note">Sumber: TradingView · diperbarui ' + new Date().toLocaleTimeString('id-ID') + '</div>';
    return html;
  }

  function flagEmoji(code) {
    var map = {
      'us': '🇺🇸', 'id': '🇮🇩', 'eu': '🇪🇺', 'gb': '🇬🇧', 'uk': '🇬🇧', 'de': '🇩🇪',
      'fr': '🇫🇷', 'cn': '🇨🇳', 'jp': '🇯🇵', 'au': '🇦🇺', 'ca': '🇨🇦', 'nz': '🇳🇿',
      'ch': '🇨🇭', 'in': '🇮🇳', 'br': '🇧🇷', 'mx': '🇲🇽', 'kr': '🇰🇷', 'ru': '🇷🇺',
      'za': '🇿🇦', 'tr': '🇹🇷', 'nl': '🇳🇱', 'it': '🇮🇹', 'es': '🇪🇸', 'pt': '🇵🇹'
    };
    return map[String(code || '').toLowerCase()] || '🌐';
  }

  function impactBadge(v) {
    var n = parseInt(v, 10);
    if (n >= 3) return '<span class="cal-impact high">Tinggi</span>';
    if (n === 2) return '<span class="cal-impact med">Sedang</span>';
    if (n === 1) return '<span class="cal-impact low">Rendah</span>';
    return '<span class="cal-impact info">Info</span>';
  }

  function calVal(label, val) {
    if (val == null || val === '') return '';
    return '<span class="cal-val"><b>' + label + ':</b> ' + escHtml(val) + '</span>';
  }

  /* ===== TAB: STATUS ===== */
  function renderStatus() {
    var body = document.getElementById('status-body');
    if (!body) return;
    var html = '<div class="status-card">' +
      '<div class="status-row head"><span>Layanan</span><span>Status</span></div>' +
      '<div class="status-row" id="st-ai"><span>Layanan AI (Puter)</span><span class="st-wait">mengecek...</span></div>' +
      '<div class="status-row" id="st-binance"><span>Data pasar (Binance)</span><span class="st-wait">mengecek...</span></div>' +
      '<div class="status-row" id="st-coingecko"><span>Harga koin (CoinGecko)</span><span class="st-wait">mengecek...</span></div>' +
      '<div class="status-row" id="st-cal"><span>Kalender ekonomi (TradingView)</span><span class="st-wait">mengecek...</span></div>' +
      '<div class="status-row" id="st-local"><span>Penyimpanan lokal (localStorage)</span><span class="st-wait">mengecek...</span></div>' +
      '</div>';
    body.innerHTML = html;
    var checks = [
      { id: 'st-ai', run: function () { return Promise.resolve(typeof puter !== 'undefined' && puter.ai && !!puter.ai.chat); } },
      { id: 'st-binance', run: function () { return pingOk('https://data-api.binance.vision/api/v3/ping'); } },
      { id: 'st-coingecko', run: function () { return pingOk('https://api.coingecko.com/api/v3/ping'); } },
      { id: 'st-cal', run: function () { return pingOk('https://economic-calendar.tradingview.com/events'); } },
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
