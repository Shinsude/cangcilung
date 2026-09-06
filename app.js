/* cangcilung — Asisten AI gratis
 * Chat murni: satu tab, kirim pesan, dapat jawaban streaming.
 * Backend OpenAI-compatible /v1/chat/completions: OpenRouter (cloud, gratis) atau server lokal.
 */

(function () {
  'use strict';

  /* Cegah clickjacking/framing (melengkapi header CSP frame-ancestors di vercel.json). */
  try {
    if (window.self !== window.top) { window.top.location.href = window.location.href; }
  } catch (e) { window.location.href = window.location.href; }

  var SYSTEM = [
    'Kamu adalah cangcilung, asisten AI Indonesia yang cerdas, ramah, dan sangat membantu.',
    'Pahami bahasa gaul/singkatan, jawab dengan bahasa baku yang baik.',
    '',
    'ATURAN UTAMA:',
    '1. AKURAT dulu, baru lengkap. Jangan menebak — jika tidak yakin, bilang tidak yakin.',
    '2. Tunjukkan proses penalaran untuk hitungan/analisis (bullet/angka).',
    '3. Singkat untuk pertanyaan singkat. Terstruktur untuk yang kompleks (poin/tabel/kode).',
    '4. Kode: lengkap + bisa dipakai + contoh pemakaian. Jangan ulang pertanyaan user.',
    '5. Bahasa Indonesia; istilah teknis boleh Inggris.',
    '6. Verifikasi data/angka dari user sebelum dipakai.',
    '7. Perbandingan → tabel. Pertanyaan ambigu → klarifikasi dulu.',
    '8. Multi-pertanyaan: jawab SEMUA berurutan (Bagian 1, 2, dst).',
    '9. Manfaatkan konteks file/pengetahuan/web. Sebutkan sumbernya.',
    '10. Jawaban panjang: pakai heading, bold, dan akhiri dengan rangkuman 1-2 kalimat.',
    '',
    'DISCLAIMER WAJIB:',
    '- MEDIS: Selalu sertakan "Ini informasi umum, bukan pengganti konsultasi dokter." untuk pertanyaan kesehatan.',
    '- HUKUM: Selalu sertakan "Ini informasi umum, bukan pengganti konsultasi pengacara." untuk pertanyaan hukum.',
    '- KEUANGAN: Selalu sertakan "Ini informasi umum, bukan saran investasi profesional." untuk pertanyaan keuangan/investasi.',
    '- Keputusan kritis (medis, hukum, keuangan besar) → rekomendasikan konsultasi profesional.'
  ].join(' ');
  var PERSONAS = {
    default: '',
    guru: '\nGaya kamu sekarang: GURU. Jelaskan konsep dengan sabar dan runtut, gunakan analogi sederhana, dan akhiri dengan pertanyaan latihan kecil atau rangkuman. Bersemangat mengajar.',
    teman: '\nGaya kamu sekarang: TEMAN. Jawab dengan santai, akrab, dan hangat seperti teman dekat. Boleh pakai bahasa gaul ringan dan emoji, tetap akurat.',
    bos: '\nGaya kamu sekarang: BOS. Jawab singkat, langsung ke poin, tegas, tanpa basa-basi. Beri keputusan/rekomendasi yang jelas.',
    kode: '\nGaya kamu sekarang: SPESIALIS KODE. Fokus pada solusi teknis yang efisien dan benar. Berikan kode bersih dengan penjelasan singkat. Prioritaskan kualitas kode dan praktik terbaik.',
    analyst: '\nGaya kamu sekarang: ANALIS. Pendekatan sistematis: (1) definisi masalah, (2) identifikasi variabel/asumsi, (3) analisis bertahap dengan data/fakta, (4) kesimpulan dengan confidence level. Gunakan tabel untuk perbandingan. Tunjukkan semua langkah perhitungan. Akhiri dengan limitasi analisis.'
  };
  var DEFAULT_BASE = 'https://api.groq.com/openai/v1';
  var DEFAULT_MODEL = 'openai/gpt-oss-120b';
  var DEFAULT_EMBED_BASE = 'https://api.jina.ai/v1';
  var DEFAULT_EMBED_MODEL = 'jina-embeddings-v3';
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
  var MEMORY_KEY = 'cangcilung_memory';

  var els = {};
  var history = [];
  var _taSuggestText = '';
  var summary = '';
  var memory = { topics: {} };
  var settings = { baseUrl: '', model: DEFAULT_MODEL, apiKey: '', analyModel: '', persona: 'default', verifyEnabled: true, theme: 'dark', voice: '', fontSize: 'normal', soundEnabled: true, embedBaseUrl: DEFAULT_EMBED_BASE, embedKey: '', embedModel: DEFAULT_EMBED_MODEL, newsKey: '' };
  var busy = false;
  var alertChecking = false;
  var signalChecking = false;
  var abortCtrl = null;
  var lastUsedModel = '';

  var MAX_HISTORY = 500;
  var RAG_CHUNK_SIZE = 2000;
  var RAG_CHUNK_OVERLAP = 200;
  var RAG_BUDGET = 24000;
  var FILE_CHUNK = 16000;
  var MSG_BUDGET = 28000;

  function $(id) { return document.getElementById(id); }

  var cloudNotify = null;
  var kbCancel = false;
  window.__setCloudHook = function (fn) { cloudNotify = fn; };

  function touchSession() {
    var s = currentSession();
    if (s) s.updatedAt = Date.now();
  }

  function loadSummary() {
    try {
      var s = currentSession();
      if (s) { summary = s.summary || ''; return; }
      summary = localStorage.getItem(SUMMARY_KEY) || '';
    } catch (e) {}
  }


  var _cryptoKey = null;
  var _cryptoReady = false;

  function _idbOpen() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('cangcilung_keys', 1);
      req.onupgradeneeded = function (e) { e.target.result.createObjectStore('keys'); };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  }

  function _idbGet(db, key) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('keys', 'readonly');
      var req = tx.objectStore('keys').get(key);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function _idbPut(db, key, val) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('keys', 'readwrite');
      var req = tx.objectStore('keys').put(val, key);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function _buf2b64(buf) {
    var bytes = new Uint8Array(buf);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function _b642buf(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function initCrypto() {
    return _idbOpen().then(function (db) {
      return _idbGet(db, 'enc_key').then(function (existing) {
        if (existing) return crypto.subtle.importKey('jwk', existing, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']).then(function (k) {
          return crypto.subtle.exportKey('jwk', k).then(function (jwk) {
            return _idbPut(db, 'enc_key', jwk).then(function () { return k; });
          });
        });
      }).then(function (k) { _cryptoKey = k; _cryptoReady = true; });
    }).catch(function () { _cryptoReady = false; });
  }

  function encryptStr(plaintext) {
    if (!_cryptoReady || !plaintext) return Promise.resolve(plaintext);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, _cryptoKey, new TextEncoder().encode(plaintext))
      .then(function (enc) { return _buf2b64(iv.buffer) + '.' + _buf2b64(enc); });
  }

  function decryptStr(data) {
    if (!_cryptoReady || !data || data.indexOf('.') === -1) return Promise.resolve(data);
    var parts = data.split('.');
    if (parts.length !== 2) return Promise.resolve(data);
    try {
      var iv = new Uint8Array(_b642buf(parts[0]));
      var enc = _b642buf(parts[1]);
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, _cryptoKey, enc)
        .then(function (dec) { return new TextDecoder().decode(dec); })
        .catch(function () { return data; });
    } catch (e) { return Promise.resolve(data); }
  }

  var DEPRECATED_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'meta-llama/llama-4-scout-17b-16e-instruct'];

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        settings.baseUrl = s.baseUrl || '';
        var m = s.model || DEFAULT_MODEL;
        settings.model = DEPRECATED_MODELS.indexOf(m) >= 0 ? DEFAULT_MODEL : m;
        settings.apiKey = s.apiKey || '';
        settings.analyModel = s.analyModel || '';
        settings.persona = s.persona || 'default';
        settings.verifyEnabled = s.verifyEnabled !== false;
        settings.theme = s.theme || 'dark';
        settings.voice = s.voice || '';
        settings.fontSize = s.fontSize || 'normal';
        settings.soundEnabled = s.soundEnabled !== false;
        settings.suggestEnabled = s.suggestEnabled === true;
        settings.embedBaseUrl = s.embedBaseUrl || DEFAULT_EMBED_BASE;
        settings.embedKey = s.embedKey || '';
        settings.embedModel = s.embedModel || DEFAULT_EMBED_MODEL;
        settings.newsKey = s.newsKey || '';
      }
    } catch (e) {}
  }

  function decryptApiKey() {
    if (settings.apiKey && settings.apiKey.indexOf('.') > 0 && /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(settings.apiKey)) {
      return decryptStr(settings.apiKey).then(function (dec) { settings.apiKey = dec; }).catch(function () {});
    }
    return Promise.resolve();
  }

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme || 'dark');
    var dark = document.getElementById('hljs-dark');
    var light = document.getElementById('hljs-light');
    if (dark && light) {
      var isLight = theme === 'light';
      dark.disabled = isLight;
      light.disabled = !isLight;
    }
    var btn = $('btn-theme');
    if (btn) {
      btn.textContent = theme === 'light' ? '🌤️' : theme === 'violet' ? '🌈' : '🌙';
      btn.title = 'Tema: ' + theme;
      btn.setAttribute('aria-pressed', String(theme !== 'dark'));
    }
  }

  var QUICK_MODELS = [
    'openai/gpt-oss-120b',
    'qwen/qwen3.6-27b',
    'openai/gpt-oss-20b'
  ];
  var MODEL_LABELS = {
    'openai/gpt-oss-120b': '⚡ GPT-OSS 120B (Cepat & Cerdas)',
    'qwen/qwen3.6-27b': '🧠 Qwen 3.6 27B (Analisis)',
    'openai/gpt-oss-20b': '🚀 GPT-OSS 20B (Ringan)'
  };

  function populateQuickModel() {
    var list = $('quick-model-list');
    var btn = $('quick-model-btn');
    if (!list || !btn) return;
    var cur = settings.model || DEFAULT_MODEL;
    var models = QUICK_MODELS.slice();
    if (models.indexOf(cur) === -1) models.unshift(cur);
    list.innerHTML = '';
    models.forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'model-dropdown-item' + (m === cur ? ' selected' : '');
      var labelSpan = document.createElement('span');
      labelSpan.className = 'model-item-label';
      labelSpan.textContent = MODEL_LABELS[m] || m;
      var subSpan = document.createElement('span');
      subSpan.className = 'model-item-sub';
      subSpan.textContent = m;
      b.appendChild(labelSpan);
      b.appendChild(subSpan);
      b.dataset.model = m;
      b.addEventListener('click', function () {
        settings.model = m;
        saveSettings();
        connSub();
        populateQuickModel();
        list.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        setStatus('⚡ Model: ' + m);
      });
      list.appendChild(b);
    });
    btn.querySelector('.model-name').textContent = MODEL_LABELS[cur] || cur;
  }

  var FONT_SIZES = ['small', 'normal', 'large'];

  function applyFont() {
    var box = $('chat-messages');
    if (box) box.setAttribute('data-font', settings.fontSize || 'normal');
  }


  var pinned = [];

  function loadPinned() {
    pinned = [];
    var s = currentSession();
    if (s && Array.isArray(s.pinned)) pinned = s.pinned;
  }

  function savePinned() {
    var s = currentSession();
    if (s) { s.pinned = pinned; touchSession(); saveSessions(); }
  }

  function togglePin(index) {
    if (index < 0 || index >= history.length) return;
    var m = history[index];
    var key = m.content;
    var found = pinned.some(function (p) { return p.content === key; });
    if (found) pinned = pinned.filter(function (p) { return p.content !== key; });
    else pinned.unshift({ role: m.role, content: m.content });
    savePinned();
    renderPins();
    setStatus(found ? '📌 Pin dilepas.' : '📌 Pesan disematkan.');
  }

  function renderPins() {
    var list = $('pins-list');
    if (!list) return;
    list.innerHTML = '';
    if (!pinned.length) {
      list.innerHTML = '<p class="set-hint">Belum ada pesan tersemat. Klik 📌 di samping pesan untuk menyemat.</p>';
      return;
    }
    pinned.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'pin-item';
      var role = document.createElement('div');
      role.className = 'pin-role';
      role.textContent = p.role === 'user' ? '🧑 Anda' : '🤖 cangcilung';
      var body = document.createElement('div');
      body.className = 'pin-body';
      body.textContent = p.content.slice(0, 500);
      var act = document.createElement('button');
      act.className = 'pin-act';
      act.textContent = '📌 Lepas';
      act.addEventListener('click', function () {
        pinned = pinned.filter(function (x) { return x.content !== p.content; });
        savePinned();
        renderPins();
        renderHistory();
      });
      item.appendChild(role);
      item.appendChild(body);
      item.appendChild(act);
      list.appendChild(item);
    });
  }





  function updateInputCount() {
    var el = $('input-count');
    if (!el) return;
    var v = ($('chat-input').value || '').trim();
    if (!v) { el.textContent = ''; el.style.color = ''; return; }
    var words = v.split(/\s+/).filter(function (w) { return w.length; }).length;
    el.textContent = v.length + ' karakter · ' + words + ' kata';
    if (v.length > 25000) { el.style.color = '#ef4444'; el.textContent += ' (dekat batas 30.000)'; }
    else if (v.length > 20000) { el.style.color = '#f59e0b'; el.textContent += ' (' + Math.round((1 - v.length / 30000) * 100) + '% tersisa)'; }
    else { el.style.color = ''; }
  }

  function cycleTheme() {
    var order = ['dark', 'light', 'violet'];
    var idx = order.indexOf(settings.theme);
    if (idx === -1) idx = 0;
    settings.theme = order[(idx + 1) % order.length];
    saveSettings();
    applyTheme(settings.theme);
    setStatus('🎨 Tema: ' + settings.theme);
  }

  var _saveSettingsPending = null;
  function saveSettings() {
    if (_saveSettingsPending) return;
    _saveSettingsPending = encryptStr(settings.apiKey).then(function (encKey) {
      _saveSettingsPending = null;
      var toSave = {};
      for (var k in settings) { if (settings.hasOwnProperty(k)) toSave[k] = settings[k]; }
      toSave.apiKey = encKey;
      try { safeSetItem(SETTINGS_KEY, JSON.stringify(toSave)); } catch (e) {}
      if (window.CC && window.CC.storage && !window.CC.storage.isFallback()) {
        window.CC.storage.set(SETTINGS_KEY, toSave);
      }
      if (cloudNotify) cloudNotify('settings');
    });
  }

  var sessions = [];
  var currentSessionId = null;

  function loadSessions() {
    var found, i;
    try {
      var raw = JSON.parse(localStorage.getItem(SESSIONS_KEY) || 'null');
      if (Array.isArray(raw) && raw.length) {
        sessions = raw;
        currentSessionId = localStorage.getItem('cangcilung_active_session') || sessions[0].id;
        found = false;
        for (i = 0; i < sessions.length; i++) { if (sessions[i].id === currentSessionId) { found = true; break; } }
        if (!found) currentSessionId = sessions[0].id;
      } else {
        throw new Error('empty');
      }
    } catch (e) {
      sessions = [{ id: 's1', name: 'Percakapan 1', history: [], summary: '' }];
      currentSessionId = 's1';
      try {
        var legacy = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        if (Array.isArray(legacy) && legacy.length) sessions[0].history = legacy.slice(-MAX_HISTORY);
        var legacySum = localStorage.getItem(SUMMARY_KEY) || '';
        if (legacySum) sessions[0].summary = legacySum;
      } catch (e2) {}
      saveSessions();
    }
    if (window.CC && window.CC.storage && !window.CC.storage.isFallback()) {
      window.CC.storage.migrateFromLocalStorage([SESSIONS_KEY, SETTINGS_KEY, SUMMARY_KEY, HISTORY_KEY, MEMORY_KEY, USAGE_KEY]).catch(function () {});
    }
  }

  var _lsWarned = false;
  function safeSetItem(key, val) {
    try { localStorage.setItem(key, val); return true; }
    catch (e) {
      if (!_lsWarned) { _lsWarned = true; setStatus('⚠️ localStorage penuh! Data mungkin tidak tersimpan. Hapus beberapa sesi lama.', true); }
      return false;
    }
  }
  var _saveTimer = null;
  function saveSessions() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      _saveTimer = null;
      safeSetItem(SESSIONS_KEY, JSON.stringify(sessions));
      try { localStorage.setItem('cangcilung_active_session', currentSessionId); } catch (e) {}
      if (window.CC && window.CC.storage && !window.CC.storage.isFallback()) {
        window.CC.storage.bulkSet([
          [SESSIONS_KEY, sessions],
          ['cangcilung_active_session', currentSessionId]
        ]);
      }
      if (cloudNotify) cloudNotify('sessions');
    }, 300);
  }
  function saveSessionsNow() {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    safeSetItem(SESSIONS_KEY, JSON.stringify(sessions));
    try { localStorage.setItem('cangcilung_active_session', currentSessionId); } catch (e) {}
    if (window.CC && window.CC.storage && !window.CC.storage.isFallback()) {
      window.CC.storage.bulkSet([
        [SESSIONS_KEY, sessions],
        ['cangcilung_active_session', currentSessionId]
      ]);
    }
    if (cloudNotify) cloudNotify('sessions');
  }
  window.saveSessionsNow = saveSessionsNow;

  function currentSession() {
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === currentSessionId) return sessions[i];
    }
    return sessions[0];
  }


  function autoTitle(text) {
    var s = currentSession();
    if (!s) return;
    if (s.history.length > 1) return;
    var clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean.length > 48) clean = clean.slice(0, 48) + '…';
    s.name = clean || s.name;
    touchSession();
    saveSessions();
  }

  function selectSession(id) {
    if (busy) { abortAll(); }
    editingIndex = -1;
    currentSessionId = id;
    saveSessions();
    history = [];
    summary = '';
    var s = currentSession();
    if (s) { history = s.history.slice(); summary = s.summary || ''; }
    loadPinned();
    clearAttachment();
    clearImage();
    renderHistory();
    connSub();
    closeSessions();
  }

  function deleteSession(id) {
    if (sessions.length <= 1) { setStatus('Minimal satu percakapan harus ada.', true); return; }
    if (busy) { if (abortCtrl) abortCtrl.abort(); busy = false; setSendUI(false); }
    editingIndex = -1;
    sessions = sessions.filter(function (s) { return s.id !== id; });
    if (cloudNotify) cloudNotify('deleteSession', id);
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

  var renameSessionId = null;

  function renameSession(id) {
    var s = null;
    for (var i = 0; i < sessions.length; i++) if (sessions[i].id === id) s = sessions[i];
    if (!s) return;
    renameSessionId = id;
    $('rename-input').value = s.name;
    $('rename-status').textContent = '';
    $('rename-status').className = 'set-status';
    openModal('rename-modal');
    var inp = $('rename-input');
    inp.focus();
    inp.select();
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
        openConfirm('Hapus percakapan', 'Hapus percakapan "' + s.name + '" permanen?', '🗑️ Hapus', function () {
          deleteSession(s.id);
          showToast('🗑️ Percakapan dihapus.');
        }, '🗑️');
      });
      row.appendChild(label);
      row.appendChild(rename);
      row.appendChild(del);
      box.appendChild(row);
    });
    renderSidebarChatList();
  }

  function renderSidebarChatList() {
    var box = $('sidebar-chat-list');
    if (!box) return;
    box.innerHTML = '';
    sessions.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'sidebar-chat-item' + (s.id === currentSessionId ? ' active' : '');
      var label = document.createElement('span');
      label.className = 'sidebar-chat-label';
      label.textContent = s.name;
      label.title = s.history.length + ' pesan';
      label.addEventListener('click', function () { selectSession(s.id); closeSidebar(); });
      var actions = document.createElement('span');
      actions.className = 'sidebar-chat-actions';
      var rename = document.createElement('button');
      rename.className = 'sidebar-chat-btn';
      rename.textContent = '✏️';
      rename.title = 'Ganti nama';
      rename.addEventListener('click', function (e) { e.stopPropagation(); renameSession(s.id); });
      var del = document.createElement('button');
      del.className = 'sidebar-chat-btn';
      del.textContent = '🗑️';
      del.title = 'Hapus';
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        openConfirm('Hapus percakapan', 'Hapus percakapan "' + s.name + '" permanen?', '🗑️ Hapus', function () {
          deleteSession(s.id);
          showToast('🗑️ Percakapan dihapus.');
        }, '🗑️');
      });
      actions.appendChild(rename);
      actions.appendChild(del);
      row.appendChild(label);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }


  function closeSidebar() {
    if (window.CC && window.CC.ui) return window.CC.ui.closeSidebar();
    var sb = $('sidebar');
    if (sb) sb.classList.remove('open');
  }


  function closeSessions() {
    closeModal('sessions-modal');
  }

  function loadHistory() {
    try {
      var s = currentSession();
      if (s) { history = s.history.slice(); }
    } catch (e) {}
  }

  function saveHistory() {
    try {
      var s = currentSession();
      if (s) { s.history = history.slice(-MAX_HISTORY); touchSession(); saveSessions(); }
    } catch (e) {}
  }

  function loadMemory() {
    try {
      var raw = localStorage.getItem(MEMORY_KEY);
      if (raw) memory = JSON.parse(raw);
      if (!memory.prefs) memory.prefs = {};
      if (!memory.entities) memory.entities = { names: {}, dates: {}, facts: [] };
    } catch (e) {}
  }
  function saveMemory() {
    try {
      var v = JSON.stringify(memory);
      if (v && v.length > 20000) {
        var ks = Object.keys(memory.topics || {}).sort(function (a, b) { return (memory.topics[b] || 0) - (memory.topics[a] || 0); });
        while (ks.length && v.length > 15000) {
          var drop = ks.pop();
          if (!drop) break;
          delete memory.topics[drop];
          v = JSON.stringify(memory);
        }
      }
      safeSetItem(MEMORY_KEY, JSON.stringify(memory));
    } catch (e) {}
  }
  function trackTopic(text) {
    var words = (text.toLowerCase().match(/[a-z0-9]{4,}/g) || []);
    var STOP = ['yang', 'dengan', 'untuk', 'dalam', 'adalah', 'ini', 'itu', 'bagaimana', 'mengapa', 'kenapa', 'apakah', 'tolong', 'jelaskan', 'buatkan', 'tulis', 'adalah', 'bisa', 'akan', 'sudah', 'belum', 'cara', 'apa'];
    words.forEach(function (w) { if (STOP.indexOf(w) === -1) memory.topics[w] = (memory.topics[w] || 0) + 1; });
    var top = Object.keys(memory.topics).sort(function (a, b) { return memory.topics[b] - memory.topics[a]; }).slice(0, 30);
    var slim = {};
    top.forEach(function (k) { slim[k] = memory.topics[k]; });
    memory.topics = slim;
    trackPrefs(text);
    trackEntities(text);
    trackTrading(text);
    saveMemory();
  }
  function trackTrading(text) {
    if (!memory.trading) memory.trading = { risk: '', capital: 0, symbols: [], style: '' };
    var t = text.toLowerCase();
    var m;
    var changed = false;
    if (/\b(risk (?:3|2|1)|risiko (?:3|2|1)|agresif|konservatif|moderat|safe|aman)\b/i.test(t)) {
      if (/\bagresif\b/.test(t)) memory.trading.risk = 'agresif';
      else if (/\bkonservatif\b/.test(t) || /\b(aman|safe)\b/.test(t)) memory.trading.risk = 'konservatif';
      else { m = t.match(/\brisk\s+(\d)\b|\brisiko\s+(\d)\b/); memory.trading.risk = m && (m[1] || m[2]) ? 'level ' + (m[1] || m[2]) : 'moderat'; }
      changed = true;
    }
    m = t.match(/\b(modal|capital|deposit)\s*(?:saya|aku)?\s*(?::|=|dari|nya)?\s*(?:rp\s*|idr\s*|\$\s*)?([\d.,]+)\s*k?\b/i);
    if (m && m[1]) {
      var num = parseFloat(String(m[1]).replace(/,/g, ''));
      if (!isNaN(num) && num > 0 && num < 1e12) {
        memory.trading.capital = /\b(rp|idr)\b|\./i.test(t) ? num : num;
        changed = true;
      }
    }
    var symStrings = t.match(/\b(xau(?:usd)?|gold|emas|ndx|nasdaq|dji|dow|spx|s&p|dxy|vix|us30)\b/g);
    if (symStrings) {
      var canonical = { gold: 'XAUUSD', emas: 'XAUUSD', xau: 'XAUUSD', xauusd: 'XAUUSD', ndx: 'NDX', nasdaq: 'NDX', dji: 'US30', dow: 'US30', us30: 'US30', spx: 'SPX', 's&p': 'SPX', dxy: 'DXY', vix: 'VIX' };
      symStrings.forEach(function (s) { var c = canonical[s.toLowerCase()]; if (c && memory.trading.symbols.indexOf(c) === -1) { memory.trading.symbols.push(c); changed = true; } });
      memory.trading.symbols = memory.trading.symbols.slice(-5);
    }
    if (/\b(day trading|intraday|scalping|swing|position trading|long term|jangka panjang|hari ini)\b/i.test(t)) {
      if (/\b(day trading|intraday)\b/.test(t)) memory.trading.style = 'intraday';
      else if (/\bscalping\b/.test(t)) memory.trading.style = 'scalping';
      else if (/\b(swing)\b/.test(t)) memory.trading.style = 'swing';
      else if (/\b(long term|jangka panjang)\b/.test(t)) memory.trading.style = 'long term';
      changed = true;
    }
    if (changed) {
      memory.trading.updatedAt = nowTime();
    }
  }
  function trackPrefs(text) {
    var t = text.toLowerCase();
    if (!memory.prefs) memory.prefs = {};
    if (/\b(bahasa indonesia|pakai bahasa|gunakan bahasa|indo|id)\b/i.test(t)) memory.prefs.lang = 'id';
    if (/\b(bahasa inggris|english|use english|pakai english)\b/i.test(t)) memory.prefs.lang = 'en';
    if (/\b(singkat|pendek|short|brief|to the point|langsung ke poin)\b/i.test(t)) memory.prefs.style = 'concise';
    if (/\b(detail|lengkap|panjang|elaborate|jelaskan panjang|step by step)\b/i.test(t)) memory.prefs.style = 'detailed';
    if (/\b(formal|baku|terstruktur|rapi)\b/i.test(t)) memory.prefs.tone = 'formal';
    if (/\b(santai|gaul|casual|kasual|asik|fun)\b/i.test(t)) memory.prefs.tone = 'casual';
    var prefKeys = Object.keys(memory.prefs);
    if (prefKeys.length > 5) {
      var newPrefs = {};
      prefKeys.slice(-5).forEach(function (k) { newPrefs[k] = memory.prefs[k]; });
      memory.prefs = newPrefs;
    }
  }
  function trackEntities(text) {
    if (!memory.entities) memory.entities = { names: {}, dates: {}, facts: [] };
    var nameMatches = text.match(/\b(saya\s+namaku?|nama\s+saya|aku\s+namaku?|my\s+name\s+is|panggil\s+saya|call\s+me)\s+([a-zA-Z][a-zA-Z\s]{1,39})/gi);
    if (nameMatches) {
      nameMatches.forEach(function (m) {
        var name = m.replace(/^(saya\s+namaku?|nama\s+saya|aku\s+namaku?|my\s+name\s+is|panggil\s+saya|call\s+me)\s+/i, '').trim();
        if (name && name.length > 1 && name.length < 40) memory.entities.names[name.toLowerCase()] = (memory.entities.names[name.toLowerCase()] || 0) + 1;
      });
    }
    var dateMatches = text.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g);
    if (dateMatches) {
      dateMatches.forEach(function (d) { memory.entities.dates[d] = (memory.entities.dates[d] || 0) + 1; });
      var topDates = Object.keys(memory.entities.dates).sort(function (a, b) { return memory.entities.dates[b] - memory.entities.dates[a]; }).slice(0, 10);
      var slimDates = {};
      topDates.forEach(function (k) { slimDates[k] = memory.entities.dates[k]; });
      memory.entities.dates = slimDates;
    }
    var factMatches = text.match(/\b(saya\s+kerja|kerja\s+di|work\s+at|bekerja\s+di|tinggal\s+di|live\s+in|domisili|asal\s+dari|berasal\s+dari)\s+(.{3,40})/gi);
    if (factMatches) {
      var FACT_CATEGORIES = { 'kerja di': 'pekerjaan', 'work at': 'pekerjaan', 'bekerja di': 'pekerjaan', 'saya kerja': 'pekerjaan', 'tinggal di': 'domisili', 'live in': 'domisili', 'domisili': 'domisili', 'asal dari': 'asal', 'berasal dari': 'asal' };
      factMatches.forEach(function (f) {
        var fact = f.trim().toLowerCase();
        var cat = null;
        Object.keys(FACT_CATEGORIES).forEach(function (k) { if (fact.indexOf(k) !== -1) cat = FACT_CATEGORIES[k]; });
        if (cat) {
          memory.entities.facts = memory.entities.facts.filter(function (ef) {
            var efCat = null;
            Object.keys(FACT_CATEGORIES).forEach(function (k) { if (ef.indexOf(k) === 0) efCat = FACT_CATEGORIES[k]; });
            return efCat !== cat;
          });
        }
        if (memory.entities.facts.indexOf(fact) === -1 && memory.entities.facts.length < 15) {
          memory.entities.facts.push(fact);
        }
      });
    }
  }

  /* Utilitas bahasa/sentimen didelegasikan ke lib/langti.js (sumber tunggal). */
  var LANG = window.cangcilungLang || {};

  var summarizing = false;
  var attachedFile = null;
  var attachedImage = null;

  var _lib = function () { return window.cangcilungLib || {}; };


  /* ===== Typing Indicator (actual DOM dots) ===== */
  function showTyping(bubble) {
    if (window.CC && window.CC.render) return window.CC.render.showTyping(bubble);
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
    if (window.CC && window.CC.render) return window.CC.render.removeTyping(bubble);
    var el = bubble.querySelector('.typing-indicator');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }


  function clearAttachment() {
    attachedFile = null;
    var elChip = $('attach-chip');
    if (elChip) elChip.hidden = true;
    var elBtn = $('btn-file-summary');
    if (elBtn) elBtn.hidden = true;
    if (window.cangcilung && window.cangcilung.refreshChip) window.cangcilung.refreshChip();
  }

  function baseUrl() {
    var b = settings.baseUrl.replace(/\/+$/, '');
    return b || DEFAULT_BASE;
  }

  /* Proxy server-side (/api/chat): key disimpan di Server (GROQ_API_KEY),
     tidak pernah bocor ke browser. Aktif bila baseUrl diarahkan ke 'api'/'/api'. */



  /* Hanya izinkan API key dikirim ke HTTPS atau server lokal, tidak ke HTTP publik (anti bocor/MITM). */

  function connSub() {
    var el = $('conn-sub');
    if (!el) return;
    el.textContent = 'ML & DL Signal Trading • XAUUSD • USA100 • NDX • DXY';
  }

  function setStatus(msg, isError) {
    if (window.CC && window.CC.ui) return window.CC.ui.setStatus(msg, isError);
    var el = $('chat-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'chat-status' + (isError ? ' error' : '');
    if (isError) el.setAttribute('role', 'alert');
    else el.removeAttribute('role');
  }

  function showToast(msg, isError) {
    if (window.CC && window.CC.ui) return window.CC.ui.showToast(msg, isError);
    var el = $('toast');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'toast' + (isError ? ' error' : '');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 2400);
  }

  function renderMarkdown(el, text) {
    if (window.CC && window.CC.render) return window.CC.render.renderMarkdown(el, text);
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
    if (window.CC && window.CC.render) return window.CC.render.addRunButtons(el);
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
    if (window.CC && window.CC.render) return window.CC.render.runCode(source, pre);
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









  var URL_PROXIES = [
    function (u) { return u; },
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
    function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); }
  ];





  function nowTime() { return window.CC && window.CC.utils ? window.CC.utils.nowTime() : (function () { var d = new Date(), h = d.getHours(), m = d.getMinutes(); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; })(); }

  function addBubble(role, text, index, ts) {
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    if (index != null) wrap.dataset.index = index;
    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (text != null) {
      if (role === 'user') bubble.textContent = text;
      else renderMarkdown(bubble, text || '…');
    }
    var time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = ts || nowTime();
    wrap.appendChild(bubble);
    wrap.appendChild(time);
    var actions = document.createElement('div');
    actions.className = 'msg-actions';
    var copyBtn = document.createElement('button');
    copyBtn.className = 'bubble-act';
    copyBtn.textContent = '📋';
    copyBtn.title = 'Salin';
    copyBtn.dataset.action = 'copy';
    actions.appendChild(copyBtn);
    if (role === 'user' && index != null) {
      var edBtn = document.createElement('button');
      edBtn.className = 'bubble-act';
      edBtn.textContent = '✏️';
      edBtn.title = 'Edit pesan';
      edBtn.dataset.action = 'edit';
      actions.appendChild(edBtn);
    }
    if (role === 'assistant' && text && index === history.length - 1) {
      var reBtn = document.createElement('button');
      reBtn.className = 'bubble-act';
      reBtn.textContent = '🔁';
      reBtn.title = 'Ulangi jawaban';
      reBtn.dataset.action = 'regenerate';
      actions.appendChild(reBtn);
    }
    if (index != null) {
      var pinBtn = document.createElement('button');
      pinBtn.className = 'bubble-act';
      pinBtn.textContent = '📌';
      pinBtn.title = 'Semat pesan';
      pinBtn.dataset.action = 'pin';
      actions.appendChild(pinBtn);
    }
    wrap.appendChild(actions);
    $('chat-messages').appendChild(wrap);
    scrollChat();
    return bubble;
  }

  var editingIndex = -1;


  function editMessage(index) {
    if (busy) return;
    if (index < 0 || index >= history.length || history[index].role !== 'user') return;
    editingIndex = index;
    var input = $('chat-input');
    if (input) { input.value = history[index].content; input.focus(); }
    setStatus('✏️ Mengedit pesan. Kirim untuk memperbarui dan meminta jawaban ulang.');
  }

  function copyText(text) {
    var done = function () { showToast('📋 Disalin ke clipboard.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else fallbackCopy(text);
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

  function regenerateLast() {
    if (busy) return;
    var lastUser = -1;
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') { lastUser = i; break; }
    }
    if (lastUser === -1) return;
    var q = history[lastUser].content;
    history = history.slice(0, lastUser);
    saveHistory();
    renderHistory();
    var input = $('chat-input');
    if (input) input.value = q;
    sendChat();
  }

  function scrollChat() {
    var m = $('chat-messages');
    if (!m) return;
    if (!autoScrollPaused) m.scrollTop = m.scrollHeight;
  }

  var autoScrollPaused = false;

  function onChatScroll() {
    var m = $('chat-messages');
    if (!m) return;
    var nearBottom = m.scrollHeight - m.scrollTop - m.clientHeight < 80;
    autoScrollPaused = !nearBottom;
    var btn = $('btn-scroll-down');
    if (btn) btn.hidden = nearBottom;
  }

  function scrollToBottom() {
    autoScrollPaused = false;
    var m = $('chat-messages');
    if (m) m.scrollTop = m.scrollHeight;
    var btn = $('btn-scroll-down');
    if (btn) btn.hidden = true;
  }

  var _renderedCount = 0;
  var VIRTUAL_BATCH = 40;
  var _virtualStart = 0;
  var _loadObserver = null;

  function _setupLoadOlder() {
    if (_loadObserver) _loadObserver.disconnect();
    _loadObserver = null;
    var sentinel = $('load-older-sentinel');
    if (!sentinel || _virtualStart <= 0) return;
    _loadObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) loadOlderMessages();
      });
    }, { root: $('chat-messages'), threshold: 0.1 });
    _loadObserver.observe(sentinel);
  }

  function loadOlderMessages() {
    if (_loadObserver) _loadObserver.disconnect();
    var box = $('chat-messages');
    if (!box || !history.length) return;
    var prevHeight = box.scrollHeight;
    var oldStart = _virtualStart;
    var newStart = Math.max(0, oldStart - VIRTUAL_BATCH);
    var sentinel = $('load-older-sentinel');
    if (sentinel) sentinel.remove();
    for (var i = newStart; i < oldStart; i++) {
      var m = history[i];
      var ref = box.children[0] || null;
      var wrap = document.createElement('div');
      wrap.className = 'msg ' + m.role;
      if (i != null) wrap.dataset.index = i;
      var bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      if (m.role === 'user') bubble.textContent = m.content;
      else renderMarkdown(bubble, m.content || '…');
      var time = document.createElement('div');
      time.className = 'msg-time';
      time.textContent = m.t || nowTime();
      wrap.appendChild(bubble);
      wrap.appendChild(time);
      var actions = document.createElement('div');
      actions.className = 'msg-actions';
      var copyBtn = document.createElement('button');
      copyBtn.className = 'bubble-act';
      copyBtn.textContent = '📋';
      copyBtn.title = 'Salin';
      copyBtn.dataset.action = 'copy';
      actions.appendChild(copyBtn);
      if (m.role === 'user' && i != null) {
        var edBtn = document.createElement('button');
        edBtn.className = 'bubble-act';
        edBtn.textContent = '✏️';
        edBtn.title = 'Edit pesan';
        edBtn.dataset.action = 'edit';
        actions.appendChild(edBtn);
      }
      if (m.role === 'assistant' && m.content && i === history.length - 1) {
        var reBtn = document.createElement('button');
        reBtn.className = 'bubble-act';
        reBtn.textContent = '🔁';
        reBtn.title = 'Ulangi jawaban';
        reBtn.dataset.action = 'regenerate';
        actions.appendChild(reBtn);
      }
      if (i != null) {
        var pinBtn = document.createElement('button');
        pinBtn.className = 'bubble-act';
        pinBtn.textContent = '📌';
        pinBtn.title = 'Semat pesan';
        pinBtn.dataset.action = 'pin';
        actions.appendChild(pinBtn);
      }
      wrap.appendChild(actions);
      box.insertBefore(wrap, ref);
      if (m.role === 'assistant') addRunButtons(bubble);
    }
    _virtualStart = newStart;
    _renderedCount = history.length;
    box.scrollTop = box.scrollHeight - prevHeight;
    if (_virtualStart > 0) {
      var sent = document.createElement('div');
      sent.id = 'load-older-sentinel';
      sent.className = 'load-older-sentinel';
      sent.textContent = '⬆️ Muat pesan lebih lama…';
      box.insertBefore(sent, box.firstChild);
    }
    _setupLoadOlder();
  }

  function renderHistory(forceFull) {
    var box = $('chat-messages');
    if (!box) return;
    if (!forceFull && _renderedCount > 0 && _renderedCount <= history.length) {
      var prevScrollH = box.scrollHeight;
      var wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      while (_renderedCount < history.length) {
        var m = history[_renderedCount];
        var b = addBubble(m.role, m.content, _renderedCount, m.t);
        if (m.role === 'assistant') addRunButtons(b);
        _renderedCount++;
      }
      if (wasAtBottom) box.scrollTop = box.scrollHeight;
      return;
    }
    var isFull = forceFull || searchActive || _renderedCount === 0;

    if (isFull) {
      box.innerHTML = '';
      _renderedCount = 0;
      if (!history.length) {
        _virtualStart = 0;
        var welcome = document.createElement('div');
        welcome.className = 'welcome';
        welcome.innerHTML = '<div class="welcome-avatar">📶</div><p>CangCilung — <strong>ML &amp; DL Signal Trading</strong>. Analisis &amp; sinyal trading teknikal (TA) + machine learning &amp; deep learning untuk XAUUSD, USA100, dan lainnya.</p><div class="welcome-chips"></div>';
        [['📶 Panel Signal', '@panel'], ['🛠 Backtest', '/backtest XAUUSD adaptive'], ['🤖 Latih ML', '/ml XAUUSD'], ['📊 Chart', '/chart XAUUSD 1d'], ['🧠 Struktur', '/structure XAUUSD'], ['🗞 Sentimen', '/news XAUUSD'], ['🧘 Skills', '/skills'], ['📋 Bantuan', '/help']].forEach(function (c) {
          var b = document.createElement('button');
          b.className = 'welcome-chip';
          b.textContent = c[0];
          b.addEventListener('click', function () {
            if (c[1] === '@panel') { openSignalPanel(); return; }
            var inp = $('chat-input');
            if (inp) { inp.value = c[1]; }
            sendChat();
          });
          welcome.querySelector('.welcome-chips').appendChild(b);
        });
        var hint = document.createElement('div');
        hint.className = 'welcome-hint';
        hint.textContent = 'Ketik perintah → Enter. Contoh: /sinyal XAUUSD adaptive • /ml XAUUSD • /backtest XAUUSD adaptive eval';
        welcome.appendChild(hint);
        box.appendChild(welcome);
        return;
      }
      if (searchActive) {
        _virtualStart = 0;
      } else if (history.length > VIRTUAL_BATCH) {
        _virtualStart = history.length - VIRTUAL_BATCH;
      } else {
        _virtualStart = 0;
      }
      _renderedCount = _virtualStart;
      if (_virtualStart > 0) {
        var sent = document.createElement('div');
        sent.id = 'load-older-sentinel';
        sent.className = 'load-older-sentinel';
        sent.textContent = '⬆️ Muat pesan lebih lama…';
        box.appendChild(sent);
      }
    }

    while (_renderedCount < history.length) {
      var m = history[_renderedCount];
      var b = addBubble(m.role, m.content, _renderedCount, m.t);
      if (m.role === 'assistant') addRunButtons(b);
      _renderedCount++;
    }

    if (isFull && !searchActive && _virtualStart > 0) {
      if (!$('load-older-sentinel')) {
        var sent2 = document.createElement('div');
        sent2.id = 'load-older-sentinel';
        sent2.className = 'load-older-sentinel';
        sent2.textContent = '⬆️ Muat pesan lebih lama…';
        box.insertBefore(sent2, box.firstChild);
      }
      _setupLoadOlder();
    }

    if (suggestions.length) renderSuggestions();
    if (searchActive) runSearch();
  }

  var searchMatches = [];
  var searchIdx = 0;
  var searchActive = false;

  function toggleSearch() {
    searchActive = !searchActive;
    var sec = $('sidebar-search-section');
    if (sec) sec.hidden = !searchActive;
    if (searchActive) {
      var inp = $('search-input');
      if (inp) { inp.value = ''; inp.focus(); }
      renderHistory();
    } else {
      clearSearch();
    }
  }

  function clearSearch() {
    searchActive = false;
    searchMatches = [];
    searchIdx = 0;
    var cnt = $('search-count');
    if (cnt) cnt.textContent = '';
    var inp = $('search-input');
    if (inp) inp.value = '';
    renderHistory(true);
  }

  function runSearch() {
    var inp = $('search-input');
    var q = inp ? inp.value.trim().toLowerCase() : '';
    if (!q) { searchMatches = []; searchIdx = 0; }
    searchMatches = [];
    var msgs = document.querySelectorAll('#chat-messages .msg');
    msgs.forEach(function (el, i) {
      el.style.border = '';
      el.style.background = '';
      var txt = (el.textContent || '').toLowerCase();
      if (txt.indexOf(q) !== -1) searchMatches.push(i);
    });
    searchIdx = searchMatches.length ? 0 : -1;
    var cnt = $('search-count');
    if (cnt) cnt.textContent = searchMatches.length ? (searchIdx + 1) + '/' + searchMatches.length + ' ditemukan' : 'Tidak ditemukan';
    gotoSearch();
  }

  function gotoSearch() {
    var msgs = document.querySelectorAll('#chat-messages .msg');
    msgs.forEach(function (el) {
      el.style.border = '';
      el.style.background = '';
    });
    if (searchIdx < 0 || searchIdx >= searchMatches.length) return;
    var idx = searchMatches[searchIdx];
    var el = msgs[idx];
    if (!el) return;
    el.style.border = '1px solid var(--accent)';
    el.style.background = 'var(--accent-dim)';
    el.scrollIntoView({ block: 'center' });
    var cnt = $('search-count');
    if (cnt && searchMatches.length) cnt.textContent = (searchIdx + 1) + '/' + searchMatches.length + ' ditemukan';
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





  function renderUsage() {
    var el = $('usage-sub');
    if (!el) return;
    var u = loadUsage();
    el.textContent = u.requests ? '· ' + u.requests + ' permintaan hari ini' : '';
  }


  var speakEnabled = false;
  var suggestEnabled = false;
  var translateEnabled = false;
  var recognition = null;
  var listening = false;




  function populateVoices() {
    var sel = $('set-voice');
    if (!sel || !window.speechSynthesis) return;
    var voices = window.speechSynthesis.getVoices() || [];
    var current = settings.voice || sel.dataset.current || '';
    sel.innerHTML = '<option value="">🔊 Otomatis</option>';
    voices.forEach(function (v, i) {
      var opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.name + ' (' + (v.lang || '?') + (v.localService ? ', lokal' : '') + ')';
      sel.appendChild(opt);
    });
    sel.value = current;
    sel.dataset.current = current;
  }



  var PERSONA_ORDER = ['default', 'guru', 'teman', 'bos', 'kode', 'analyst'];
  var PERSONA_EMOJI = { default: '✨', guru: '🎓', teman: '🤝', bos: '👔', kode: '💻', analyst: '📊' };
  var PERSONA_LABEL = { default: 'Seimbang', guru: 'Guru', teman: 'Teman', bos: 'Bos', kode: 'Kode', analyst: 'Analis' };


  function renderSuggestions() {
    var box = $('chat-messages');
    if (!suggestions.length) return;
    var existing = box.querySelector('.msg.suggest');
    if (existing) existing.remove();
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



  var webMode = false;
  var webFetching = false;


  /* Pencarian web didelegasikan ke lib/search.js (sumber tunggal). */
var SEARCH = window.CC && window.CC.search ? window.CC.search : null;
function needsWeb(text) { return SEARCH ? SEARCH.needsWeb(text) : false; }
function searchWeb(query) { return SEARCH ? SEARCH.searchWeb(query) : Promise.resolve(''); }
function searchWebWikipedia(query) { return SEARCH ? SEARCH.searchWebWikipedia(query) : Promise.resolve(''); }
function quoteContext(query) { return SEARCH && SEARCH.quoteContext ? SEARCH.quoteContext(query) : Promise.resolve(''); }
function chartSymbol(query) { return SEARCH && SEARCH.chartSymbol ? SEARCH.chartSymbol(query) : ''; }

  var ANALYSIS_RE = /\b(hitung|hitunglah|jumlahkan|kalikan|bagikan|kurangkan|berapakah|berapa (hasil|angka|nilai|jumlah)|rumus|persamaan|akar|logaritma|persen|konversi|prosentase|rata.?rata|mean|median|modus|standar deviasi|variansi|probabilitas|peluang)\b|\d\s*[-+*/^]\s*\d|\d+[.,]\d+\s*[-+*/^=<>]\s*\d|\(\s*\d/i;
  var LOGIC_RE = /\b(logika|logical|analisa|analisis|bandingkan|bandingkanlah|buktikan|deriv|turunan|integral|persamaan|soal|case\b|debug|perbaiki kode|tulis kode|buatkan kode|pseudocode|algoritma|optimalkan|evaluasi|penjelasan kenapa|mengapa|sebab|akibat|perbandingan|kelebihan|kekurangan|pros\s*kon)\b/i;
  var CODE_RE = /\b(kode|code|program|fungsi|function|class|api|debug|error|bug|compile|runtime|deploy|npm|pip|import|require|variable|loop|for|while|if else|switch|array|object|json|html|css|sql|query|database|regex|algorithm|typescript|javascript|python|java|golang|rust|react|vue|angular|node|express|flask|django)\b/i;
  var CREATIVE_RE = /\b(tulis|buatkan|karang|cerita| puisi|dongeng|fabel|novel|artikel|blog|caption|deskripsi|deskripsikan|brainstorm|ide|konsep|name\s*game|nama\s*brand|slogan|tagline|copywriting|storytelling)\b/i;
  var COMPARE_RE = /\b(bandingkan|perbandingan|versus|vs\.?|lebih (baik|unggul|cepat|murah|bagus|efisien)|kelebihan.*kekurangan|pros?\s*dan\s*cons?|mana yang|apa bedanya|beda|perbedaan|similaritas|persamaan)\b/i;
  var EXPLAIN_RE = /\b(jelaskan|penjelasan|mengapa|kenapa|apa itu|apa\s* pengertian|definisi|arti|makna|konsep|bagaimana\s*cara|how\s+does|how\s+to|tutorial|langkah|step|cara)\b/i;
  var FACTUAL_RE = /\b(siapa|dimana|kapan|berapa (orang|jumlah|populasi|luas|tinggi)|presiden|gubernur|ibukota|negara|provinsi|kota|tahun berapa|tanggal berapa|sejarah)\b/i;
  var Multipart_RE = /\b(dan|serta|juga|tambah|lagi|kemudian|selain itu|disamping|另外|also|and|plus|furthermore)\b|;|,\s*(lalu|kemudian|setelah|sebelum)/i;
  var Ambiguous_RE = /^(apa|apakah|gimana|bagaimana|kenapa|mengapa|what|how|why|is it|does)\s*\??$/i;
  var Correction_RE = /\b(bukan|salah|kurang tepat|tidak benar|meleset|keliru|koreksi|maaf|sorry|bukan gitu|bukan begitu|harusnya|seharusnya|wrong|not (right|correct)|actually)\b/i;



  var DOMAIN_RE = {
    medical: /\b(dokter|sakit|penyakit|gejala|obat|operasi|diagnosa|kesehatan|hamil|bersalin|vitamin|suplemen|therapi|terapi|ramuan|herbal|asam lambung|diabetes|kolesterol|darah tinggi|asma|alergi|infeksi|vaksin|imunisasi)\b/i,
    legal: /\b(hukum|undang.undang|pasal|peraturan|perjanjian|kontrak|sengketa|gugatan|pengacara|advokat|narapidana|hakim|pengadilan|polisi|tersangka|korban|tilang|denda|pidana|perdata|perceraian|warisan|ahli waris)\b/i,
    financial: /\b(saham|investasi|reksa dana|crypto|bitcoin|trading|forex|bank|kredit|pinjaman|utang|pajak|pph|ppn|deviden|capital gain|rugilabih|portofolio|asing| obligasi|deposito|tabungan|angsuran|asuransi)\b/i
  };










  var STOPWORDS = ['yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'ini', 'itu', 'apa', 'bagaimana', 'berapa', 'apakah', 'kenapa', 'mengapa', 'saya', 'kamu', 'aku', 'mau', 'tolong', 'jelaskan', 'dalam', 'secara', 'akan', 'tidak', 'bisa', 'please'];


  function setSendUI(streaming) {
    if (window.CC && window.CC.ui) return window.CC.ui.setSendUI(streaming);
    var btn = $('btn-send');
    if (!btn) return;
    if (streaming) {
      btn.textContent = '⏹';
      btn.title = 'Hentikan jawaban';
      btn.disabled = false;
    } else {
      btn.textContent = '➤';
      btn.title = 'Kirim pesan';
      btn.disabled = false;
    }
  }

  function abortAll() {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = null;
    busy = false;
    setSendUI(false);
    setStatus('');
  }

  function openChartModal(title) {
    var overlay = $('chart-modal');
    var titleEl = $('chart-title');
    var container = $('chart-container');
    var closeBtn = $('btn-chart-close');
    if (!overlay || !container) return null;
    titleEl.textContent = title || 'Chart';
    overlay.hidden = false;
    function doClose() {
      overlay.hidden = true;
      if (window.CC && window.CC.ta && window.CC.ta.destroyChart) window.CC.ta.destroyChart(container);
      container.innerHTML = '';
    }
    closeBtn.onclick = doClose;
    overlay.onclick = function (e) { if (e.target === overlay) doClose(); };
    return container;
  }

  function handleChart(symbol, interval) {
    if (!window.CC || !window.CC.ta) {
      setStatus('Technical Analysis tidak dimuat.', true);
      return;
    }
    var ta = window.CC.ta;
    var container = openChartModal(symbol.toUpperCase() + ' — ' + interval);
    if (!container) return;
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#a0a0b0">⏳ Mengambil data ' + symbol + '...</div>';
    ta.fetchYahoo(symbol, interval).then(function (result) {
      var indicators = {
        ema20: ta.calcEMA(result.data, 20),
        ema50: ta.calcEMA(result.data, 50),
        bb: ta.calcBollinger(result.data, 20, 2),
        volume: result.data.map(function (d) { return { time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }; }),
        sr: ta.detectSR(result.data),
        fib: ta.calcFibonacci(result.data),
        pivots: ta.calcPivots(result.data)
      };
      ta.renderChart(container, result.data, indicators, result.name + ' (' + interval + ')');
      $('chart-title').textContent = result.name + ' — ' + interval;
    }).catch(function (err) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444">Gagal mengambil data: ' + (err.message || err) + '</div>';
    });
  }

  function handleRSI(symbol, period) {
    if (!window.CC || !window.CC.ta) {
      setStatus('Technical Analysis tidak dimuat.', true);
      return;
    }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ta = window.CC.ta;
    var container = openChartModal(symbol.toUpperCase() + ' RSI(' + period + ')');
    if (!container) return;
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#a0a0b0">⏳ Mengambil data ' + symbol + '...</div>';
    ta.fetchYahoo(symbol, '1d').then(function (result) {
      var rsiData = ta.calcRSI(result.data, period);
      var validRSI = rsiData.filter(function (r) { return r !== null; });
      var lastRSI = validRSI.length ? validRSI[validRSI.length - 1].value : '-';
      var chart = LightweightCharts.createChart(container, {
        width: container.clientWidth, height: 300,
        layout: { background: { type: 'solid', color: '#1a1a2e' }, textColor: '#a0a0b0' },
        grid: { vertLines: { color: '#2a2a3e' }, horzLines: { color: '#2a2a3e' } },
        timeScale: { timeVisible: true },
        rightPriceScale: { borderColor: '#2a2a3e' }
      });
      var rsiSeries = chart.addLineSeries({ color: '#f59e0b', lineWidth: 2, title: 'RSI(' + period + ')' });
      rsiSeries.setData(validRSI);
      var obLine = chart.addLineSeries({ color: '#ef4444', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: 'Overbought' });
      var osLine = chart.addLineSeries({ color: '#22c55e', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, title: 'Oversold' });
      var midLine = chart.addLineSeries({ color: '#6b7280', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, title: '50' });
      if (validRSI.length > 0) {
        var ts = validRSI.map(function (r) { return r.time; });
        obLine.setData(ts.map(function (t) { return { time: t, value: 70 }; }));
        osLine.setData(ts.map(function (t) { return { time: t, value: 30 }; }));
        midLine.setData(ts.map(function (t) { return { time: t, value: 50 }; }));
      }
      chart.timeScale().fitContent();
      $('chart-title').textContent = symbol.toUpperCase() + ' RSI(' + period + ') = ' + lastRSI;
      var ro = new ResizeObserver(function () { chart.applyOptions({ width: container.clientWidth }); });
      ro.observe(container);
    }).catch(function (err) {
      container.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444">Gagal: ' + (err.message || err) + '</div>';
    });
  }

  function buildTANote(symbol) {
    var _mem = memory && memory.trading;
    if (!_mem) return '';
    var parts = [];
    if (_mem.risk && !_mem.style) parts.push('Profil risiko kamu (' + _mem.risk + ') — sesuaikan ukuran posisi: risiko ' + (_mem.risk === 'konservatif' ? 'rendah (1% atau kurang)' : _mem.risk === 'agresif' ? 'tinggi (boleh lebih dari 2%)' : 'sedang (1-2%)') + ' per trade.');
    if (_mem.capital) parts.push('Dengan modal ±' + _mem.capital.toLocaleString('id-ID') + ', hindari risiko lebih dari ' + ( ( _mem.risk === 'konservatif' ? 5 : _mem.risk === 'agresif' ? 20 : 10 ) ) + '% modal per posisi.');
    if (_mem.style) parts.push('Gaya ' + _mem.style + ' — fokus timeframe ' + (_mem.style === 'intraday' ? '5m-1h' : _mem.style === 'scalping' ? '1m-5m' : _mem.style === 'swing' ? '1h-1d' : '1d-1w') + '.');
    return parts.length ? '### 📌 Catatan personal untuk kamu\n' + parts.join(' ') : '';
  }

  /* Fokus trading: Cangcilung berdiri untuk XAUUSD (emas) saja.
     Semua perintah analisis trading dialihkan ke XAUUSD bila simbol lain diminta. */
  function focusSym(symbol) {
    var u = String(symbol || 'XAUUSD').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (u === 'XAUUSD' || u === 'XAU' || u === 'GOLD' || u === 'EMAS') return { s: 'XAUUSD', forced: false };
    return { s: 'XAUUSD', forced: true, req: String(symbol).toUpperCase().trim() };
  }
  function focusNote(f) {
    if (!f || !f.forced) return;
    history.push({ role: 'assistant', content: '🔒 Cangcilung difokuskan pada **XAUUSD (emas)** — permintaan *' + f.req + '* dialihkan ke XAUUSD.', t: nowTime() });
    saveHistory();
  }

  function handleTA(symbol) {
    if (!window.CC || !window.CC.ta) {
      setStatus('Technical Analysis tidak dimuat.', true);
      return;
    }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ta = window.CC.ta;
    busy = true;
    setSendUI(true);
    setStatus('Mengambil data multi-timeframe ' + symbol + '...');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    ta.fetchMultiTF(symbol).then(function (mTF) {
      var daily = mTF['1d'];
      if (!daily || !daily.data) throw new Error('Data harian tidak tersedia');
      var analysis = ta.analyze(daily.data);
      var mtf = ta.multiTFAnalysis(mTF['1d'], mTF['1h'], mTF['15m']);
      analysis += '\n\n' + ta.formatConfluence(mtf);
      var taNote = buildTANote(symbol.toUpperCase());
      if (taNote) analysis += '\n\n' + taNote;
      var bSug = bundleSuggest(_taSuggestText, symbol);
      if (bSug) analysis += bSug;
      var session = ta.getCurrentSession();
      removeTyping(bubble);
      history.push({ role: 'assistant', content: analysis, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false;
      setSendUI(false);
      setStatus('');
      openChartModal(symbol.toUpperCase() + ' — Chart (all TF cached)');
      var container = $('chart-container');
      if (container) {
        var indicators = {
          ema20: ta.calcEMA(daily.data, 20),
          ema50: ta.calcEMA(daily.data, 50),
          bb: ta.calcBollinger(daily.data, 20, 2),
          volume: daily.data.map(function (d) { return { time: d.time, value: d.volume, color: d.close >= d.open ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }; }),
          sr: ta.detectSR(daily.data),
          fib: ta.calcFibonacci(daily.data),
          pivots: ta.calcPivots(daily.data)
        };
        ta.renderChart(container, daily.data, indicators, symbol.toUpperCase());
      }
    }).catch(function (err) {
      removeTyping(bubble);
      var msg = '⚠️ Gagal mengambil data: ' + (err.message || err);
      history.push({ role: 'assistant', content: msg, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false;
      setSendUI(false);
      setStatus('');
    });
  }

  function handleRekomendasi(symbol) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ta = window.CC.ta;
    busy = true;
    setSendUI(true);
    setStatus('Menghitung rekomendasi untuk ' + symbol + '...');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    ta.fetchMultiTF(symbol).then(function (mTF) {
      var daily = mTF['1d'];
      if (!daily || !daily.data) throw new Error('Data harian tidak tersedia');
      var analysis = ta.analyze(daily.data);
      var last = daily.data[daily.data.length - 1];
      var prev = daily.data[daily.data.length - 2];
      var change = prev ? ((last.close - prev.close) / prev.close * 100).toFixed(2) : '0';
      var atrArr = ta.calcATR(daily.data, 14).filter(Boolean);
      var atr = atrArr.length ? atrArr[atrArr.length - 1].value : (last.high - last.low);
      var sig = ta.genSignals(daily.data, 'all');
      var signals = analysis.match(/^-\s.*$/gm) || [];
      var scoring = ta.scoreSignals(signals, daily.data);
      var near = ta.detectSR(daily.data);
      var bias = scoring.bias;
      var confidence = scoring.confidence;
      var rec = bias === 'BULLISH' ? '**BELI (BUY/LONG)** 🟢' : bias === 'BEARISH' ? '**JUAL (SELL/SHORT)** 🔴' : '**TUNGGU (WATCH/NEUTRAL)** ⚪';
      var entry = last.close;
      var sl = bias === 'BULLISH' ? last.close - 1.5 * atr : bias === 'BEARISH' ? last.close + 1.5 * atr : last.close - atr;
      var tp = bias === 'BULLISH' ? last.close + 3 * atr : bias === 'BEARISH' ? last.close - 3 * atr : last.close + atr;
      var rr = bias === 'BULLISH' || bias === 'BEARISH' ? Math.abs(tp - entry) / Math.abs(sl - entry) : 0;
      var neutralWarn = bias === 'NEUTRAL' ? 'Bias masih netral — hindari entry agresif; tunggu jeda/konfirmasi breakout.' : '';
      var out = '## Rekomendasi ' + symbol.toUpperCase() + '\n';
      out += '**Arah:** ' + rec + '\n';
      out += '**Harga saat ini:** ' + entry.toFixed(2) + ' (' + (change >= 0 ? '+' : '') + change + '%)\n';
      out += '**Confidence:** ' + confidence + '% (skor ' + scoring.score + '/100, ' + scoring.confluentCount + ' signal searah)\n\n';
      out += '### Eksekusi (saran, bukan nasihat keuangan)\n';
      out += '- **Entry:** ~' + entry.toFixed(2) + '\n';
      out += '- **Stop Loss:** ' + sl.toFixed(2) + '\n';
      out += '- **Take Profit:** ' + tp.toFixed(2) + '\n';
      out += '- **R:R:** 1:' + rr.toFixed(2) + '\n';
      out += '- **Ukuran posisi (1% risiko, akun 10rb):** ~' + (100 / atr).toFixed(3) + ' unit max (lihat /risk utk presisi)\n\n';
      if (neutralWarn) out += '> ' + neutralWarn + '\n\n';
      out += '### Dasar bias (signals)\n';
      var shown = signals.slice(-6);
      if (shown.length) out += shown.join('\n') + '\n';
      out += '\n_Disclaimer: ini hasil analisis otomatis, bukan jaminan profit. Selalu verifikasi & kelola risiko._';
      removeTyping(bubble);
      history.push({ role: 'assistant', content: out, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false;
      setSendUI(false);
      setStatus('');
      suggestions = ['/rekomendasi ' + symbol, '/ta ' + symbol, '/risk ' + symbol + ' 10000 1', '/alerts'];
      renderSuggestions();
    }).catch(function (err) {
      removeTyping(bubble);
      var msg = '⚠️ Gagal membuat rekomendasi: ' + (err.message || err);
      history.push({ role: 'assistant', content: msg, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false;
      setSendUI(false);
      setStatus('');
    });
  }

  function handleSessionCommand() {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var s = window.CC.ta.getCurrentSession();
    var out = '## Sesi Market (UTC ' + s.utcHour + ':00)\n';
    out += '- Aktif: **' + s.label + '**\n\n';
    out += '### Jadwal Sesi (UTC)\n';
    out += '- Tokyo: 00:00 - 09:00\n';
    out += '- London: 08:00 - 17:00\n';
    out += '- New York: 13:00 - 22:00\n';
    out += '- Sydney: 22:00 - 07:00\n\n';
    if (s.overlap) {
      out += '### TIP\nSaat ini terjadi **overlap sesi** — ini waktu terbaik untuk trading (volatilitas tinggi, likuiditas kuat).';
    } else {
      out += 'Saat ini bukan overlap session — volatilitas lebih rendah. Hati-hati saat spread melebar.';
    }
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory();
    renderHistory();
    busy = false;
    setSendUI(false);
    setStatus('');
  }

  function handleBacktest(symbol, strategy, rawParams) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ta = window.CC.ta;
    var params = {};
    var oos = false;
    (rawParams || []).forEach(function (p) {
      if (/^oos$/i.test(p.trim())) { oos = true; return; }
      var m = p.split(':');
      if (m.length === 2) {
        var nv = parseFloat(m[1]);
        params[m[0]] = isNaN(nv) ? m[1] : nv;
      }
    });
    var quant = (params.quant || 0) > 0 ? 100 : 50;
    busy = true; setSendUI(true);
    setStatus('Backtest ' + symbol + ' dengan strategi ' + strategy + (oos ? ' (anti-overfitting / OOS)...' : '...'));
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    ta.fetchYahoo(symbol, params.tf || '1d').then(function (result) {
      var r = ta.backtest(result.data, strategy, params);
      if (r.error) throw new Error(r.error);
      var out;
      if (oos) {
        var wf = ta.walkforward(result.data, strategy, params);
        out = ta.formatWalkforward(wf, symbol) + '\n\n*Sumber: ' + (result.source || 'yahoo') + ' — sinyal dari data historis; % uji = data terbaru.*';
      } else {
        out = ta.formatBacktest(r, symbol);
        var mc = ta.monteCarlo(r, 2000);
        if (!mc.error) out += '\n\n' + ta.formatMonteCarlo(mc, symbol);
        out += '\n\n*Sumber: ' + (result.source || 'yahoo') + ' — 1 setel per-TF. Semua sinyal dihitung dari data historis.*';
      }
      removeTyping(bubble);
      history.push({ role: 'assistant', content: out, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false; setSendUI(false); setStatus('');
      if (r.equityCurve && r.equityCurve.length > 2) {
        var container = openChartModal(symbol.toUpperCase() + ' — Equity Curve (' + r.strategy + ')');
        if (container && ta.renderEquityCurve) ta.renderEquityCurve(container, r.equityCurve, 'Equity');
      }
    }).catch(function (err) {
      removeTyping(bubble); busy = false; setSendUI(false); setStatus('');
      history.push({ role: 'assistant', content: '⚠️ Gagal backtest: ' + (err.message || err), t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
    });
  }

  function handleNews(symbol) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var ta = window.CC.ta;
    busy = true; setSendUI(true);
    setStatus('Mengambil berita terbaru ' + symbol + '...');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    ta.fetchNewsSentiment(symbol, { newsKey: settings.newsKey || '' }).then(function (ns) {
      var out = ta.formatNewsSentiment(ns);
      removeTyping(bubble);
      history.push({ role: 'assistant', content: out, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false; setSendUI(false); setStatus('');
    }).catch(function (err) {
      removeTyping(bubble); busy = false; setSendUI(false); setStatus('');
      history.push({ role: 'assistant', content: '⚠️ Gagal ambil berita: ' + (err.message || err), t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
    });
  }

  function handleAlertsList() {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var out = window.CC.ta.formatAlerts();
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory(); renderHistory();
    busy = false; setSendUI(false); setStatus('');
  }

  function handleAlertAdd(symbol, target, label) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var ta = window.CC.ta;
    var r = ta.addAlert(symbol, target, label);
    var out;
    if (r.error) out = '⚠️ ' + r.error;
    else out = '✅ Alert terpasang: **' + r.alert.symbol + ' @ ' + r.alert.target + '**' + (r.alert.label ? ' (' + r.alert.label + ')' : '') + '\nTotal alert aktif: ' + r.count;
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory(); renderHistory();
    busy = false; setSendUI(false); setStatus('');
  }

  function handleAlertDelete(id) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var r = window.CC.ta.removeAlert(id);
    var out = r.removed ? '🗑️ Alert dihapus.' : '⚠️ Alert tidak ditemukan.';
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory(); renderHistory();
    busy = false; setSendUI(false); setStatus('');
  }

  function handleSignalAdd(symbol, strategy, rawParams) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ta = window.CC.ta;
    var params = {};
    (rawParams || []).forEach(function (p) {
      var m = p.split(':');
      if (m.length === 2 && !isNaN(parseFloat(m[1]))) params[m[0]] = parseFloat(m[1]);
    });
    var r = ta.addSignalAlert(symbol, strategy, params);
    var out;
    if (r.error) out = '⚠️ ' + r.error;
    else out = '✅ Live signal terpasang: **' + r.signal.symbol + '** · ' + r.signal.strategy.toUpperCase() +
      ' (period ' + r.signal.params.period + ', OB ' + r.signal.params.overbought + ', OS ' + r.signal.params.oversold + ')\n' +
      'Cangcilung pantau tiap menit & kirim notifikasi saat sinyal BUY/SELL muncul. Total: ' + r.count;
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory(); renderHistory();
    busy = false; setSendUI(false); setStatus('');
    startSignalChecker();
  }

  function handleSignalTest() {
    // uji notifikasi sistem + suara + toast — tanpa perlu menunggu crossing
    var out = '🔔 **Uji notifikasi sinyal dikirim.**\n';
    out += 'Jika notifikasi sistem belum muncul, pastikan izin diberikan:\n';
    out += '1. Klik ikon 🔒 di address bar → izinkan **Notifications**\n';
    out += '2. Kalau diblokir: susun ulang izin situs, muat ulang halaman, lalu ulangi `/sinyal-test`\n\n';
    requestSignalPermission();
    setTimeout(function () {
      playAlertSound();
      showSignalNotification({ side: 'long', symbol: 'XAUUSD', strategy: 'test', price: '—', confluence: 100, verdict: 'UJI' });
      if (window.CC && window.CC.ui) window.CC.ui.showToast('🔔 Uji notifikasi sinyal berhasil dikirim.', 4000);
    }, 300);
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory(); renderHistory();
    busy = false; setSendUI(false); setStatus('');
  }

  function handleSignalList() {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var out = window.CC.ta.formatSignalAlerts();
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory(); renderHistory();
    busy = false; setSendUI(false); setStatus('');
  }

  function handleSignalDelete(id) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var r = window.CC.ta.removeSignalAlert(id);
    var out = r.removed ? '🗑️ Live signal dihapus.' : '⚠️ Live signal tidak ditemukan.';
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory(); renderHistory();
    busy = false; setSendUI(false); setStatus('');
  }

  function handleSignalClear() {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    window.CC.ta.clearSignalAlerts();
    var out = '🧹 Semua live signal dibersihkan.';
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory(); renderHistory();
    busy = false; setSendUI(false); setStatus('');
  }

  function handleSignalHistory() {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var out;
    if (window.CC.ta.listSignalLog().length && window.CC.ta.formatSignalLog) {
      out = window.CC.ta.formatSignalLog();
    } else {
      out = 'Belum ada riwayat sinyal. Aktifkan `/sinyal XAUUSD <strategi>` lalu tunggu crossing BUY/SELL.';
    }
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory(); renderHistory();
    busy = false; setSendUI(false); setStatus('');
  }

  function updateSignalBadge() {
    var badge = $('signal-badge');
    if (!badge) return;
    try {
      var n = window.CC && window.CC.ta && window.CC.ta.listSignalAlerts ? window.CC.ta.listSignalAlerts().length : 0;
      if (n > 0) { badge.textContent = n; badge.hidden = false; }
      else badge.hidden = true;
    } catch (e) {}
  }

  /* Panel menu Signal: pantau live signal utk XAUUSD via antarmuka (tanpa ketik).
     Auto-mulai segera saat dibuka — tidak perlu klik apa pun. Dropdown strategi
     mengganti indikator yang dipantau secara otomatis. */
  function openSignalPanel() {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var ta = window.CC.ta;
    requestSignalPermission();
    var container = openChartModal('📶 Live Signal — XAUUSD');
    if (!container) return;
    if (window._signalPanelTimer) clearInterval(window._signalPanelTimer);

    /* Auto-mulai: pastikan ada signal XAUUSD ADAPTIVE (jika belum ada). */
    ensureXauusdSignal('adaptive');

    /* Auto-refresh tiap 45 dtk selama panel terbuka */
    window._signalPanelTimer = setInterval(function () {
      var overlay = $('chart-modal');
      if (!overlay || overlay.hidden) { clearInterval(window._signalPanelTimer); window._signalPanelTimer = null; return; }
      renderSignalPanel(container);
    }, 45000);
    renderSignalPanel(container);
    updateSignalBadge();
  }

  /* Pastikan ada signal XAUUSD untuk strategi pilihan; jika strategi lain sedang
     aktif, ganti ke strategi baru (satu signal XAUUSD per menu). */
  function ensureXauusdSignal(strategy) {
    if (!window.CC || !window.CC.ta) return null;
    var ta = window.CC.ta;
    requestSignalPermission();
    var active = ta.listSignalAlerts ? ta.listSignalAlerts() : [];
    var existing = active.filter(function (s) { return s.symbol === 'XAUUSD'; });
    var same = existing.filter(function (s) { return s.strategy === strategy; });
    if (same.length) { startSignalChecker(); return same[0]; }
    /* Hapus signal XAUUSD lama, ganti dgn strategi baru */
    existing.forEach(function (s) { ta.removeSignalAlert(s.id); });
    var r = ta.addSignalAlert('XAUUSD', strategy, { period: 14, overbought: 70, oversold: 30 });
    startSignalChecker();
    updateSignalBadge();
    return r.ok ? r.signal : null;
  }

  function renderSignalPanel(container) {
    if (!container) return;
    var ta = window.CC.ta;
    var active = ta.listSignalAlerts ? ta.listSignalAlerts() : [];
    var xau = active.filter(function (s) { return s.symbol === 'XAUUSD'; });
    var cur = (xau.length ? xau[0].strategy : 'adaptive').toLowerCase();
    var log = ta.listSignalLog ? ta.listSignalLog() : [];
    var mInfo = typeof ta.marketStatusInfo === 'function' ? ta.marketStatusInfo() : null;
    var html = '<div class="sig-panel">';

    /* Banner status pasar: selalu tampil, paling mencolok saat TUTUP */
    if (mInfo) {
      html += '<div class="sig-banner' + (mInfo.open ? ' sig-open' : '') + '">' +
        (mInfo.open ? '🟢 Market ' + mInfo.label + ' — data live' : '⛔ Market ' + mInfo.label + ' — sinyal berdasar bar penutupan terakhir hingga Jumat 21:00 UTC. Mulai lagi saat pasar buka (Min 22:00 UTC)') +
        '</div>';
    }

    /* Kartu keputusan BUY/SELL/WAIT (satu-satunya tampilan) */
    html += '<div class="sig-card"><div class="sig-label" style="text-align:center">Keputusan Live</div>';
    html += '<div id="sig-conf-body" style="color:var(--text-dim);font-size:13px">Menghitung…</div>';
    html += '</div>';

    html += '<div class="sig-tip">Auto-memantau ' + (cur || 'adaptive').toUpperCase() + ' · BUY/SELL = arah kuat & searah; WAIT = tunggu konfirmasi; keputusan dihitung saat pasar buka. Bukan saran investasi.</div>';
    html += '</div>';
    container.innerHTML = html;

    /* Konfluensi live: keputusan utk signal XAUUSD aktif (defensif — selalu hitung,
       tak bergantung pada keberadaan signal tersimpan) */
    var confBody = container.querySelector('#sig-conf-body');
    var activeXau = xau[0];
    function withTimeout(p, ms) {
      return Promise.race([
        p,
        new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })
      ]);
    }
    if (confBody && typeof ta.fetchYahoo === 'function' && typeof ta.analyzeConfluence === 'function') {
      (function (bodyEl, sig) {
        /* Hard timeout agar status "Menghitung…" tidak menggantung selamanya */
        withTimeout(ta.fetchYahoo('XAUUSD', '1d'), 15000).then(function (r) {
          if (!bodyEl) return;
          var strat = sig && sig.strategy ? sig.strategy : 'adaptive';
          var params = (sig && sig.params) ? sig.params : { period: 14, overbought: 70, oversold: 30 };
          var conf = ta.analyzeConfluence(r ? (r.data || r) : null, strat, params);
          var dec = conf.decision || 'wait';
          var decMap = { buy: { txt: 'BUY', sym: '▲', cls: 'c-up', bg: 'bg-up' }, sell: { txt: 'SELL', sym: '▼', cls: 'c-down', bg: 'bg-down' }, wait: { txt: 'WAIT', sym: '⏳', cls: 'c-warn', bg: 'bg-warn' } };
          var d = decMap[dec] || decMap.wait;
          /* Saat market tutup / data basi: keputusan bukan live — demote ke MENUNGGU,
             analisis tetap ditampilkan sebagai pratayang yang jujur. */
          var fresh = !(mInfo && !mInfo.open) && (typeof ta.barIsFresh !== 'function' || ta.barIsFresh(r && r.data ? r.data : (r || null)));
          var pDec = typeof ta.panelDecision === 'function' ? ta.panelDecision(mInfo, fresh, dec) : { demote: false, preview: (dec === 'buy' ? 'BUY' : dec === 'sell' ? 'SELL' : 'WAIT') };
          var demote = pDec.demote;
          if (demote) {
            d = decMap.wait;
            why = pDec.reason || (('Market tutup / data basi — keputusan BUY/SELL baru dihitung saat pasar buka. Analisis pratayang saat ini: ' + pDec.preview) + '.');
          }
          var h = '<div class="sig-decision">';
          h += '<div class="sig-dec-symbol ' + d.cls + '">' + d.sym + '</div>';
          h += '<div class="sig-dec-txt ' + d.cls + '">' + d.txt + '</div>';
          /* alasan singkat */
          var why;
          if (strat === 'adaptive' && conf.slopeRegime && conf.slopeRegime.ok) {
            var routed = conf.slopeRegime.regime === 'trending' ? (conf.slopeRegime.dir === 'up' ? 'NAIK → all (long)' : 'TURUN → smc (long+short)') : 'RANGE → bb (long)';
            if (dec === 'buy') why = 'ADAPTIF (' + routed + '): arah kuat & searah — layak pertimbangkan BUY.';
            else if (dec === 'sell') why = 'ADAPTIF (' + routed + '): tren TURUN terkonfirmasi — layak pertimbangkan SELL.';
            else if (conf.signal === 'flat' || !conf.signal) why = 'ADAPTIF (' + routed + '): belum ada crossing yang sah. Tunggu sinyal.';
            else why = 'ADAPTIF (' + routed + '): sinyal ada tapi belum cukup kuat — tunggu konfirmasi.';
          } else {
            if (dec === 'buy') why = 'Arah kuat & searah regime — layak pertimbangkan masuk BUY.';
            else if (dec === 'sell') why = 'Arah kuat & searah regime — layak pertimbangkan masuk SELL.';
            else if (conf.signal === 'flat' || !conf.signal) why = 'Belum ada arah jelas dari indikator. Tunggu crossing.';
            else why = 'Sinyal ada tapi belum cukup kuat/searah — tunggu konfirmasi lebih dulu.';
          }
          h += '<div class="sig-dec-why">' + why + '</div>';
          h += '</div>';
          /* Info batas data saat market tutup / data basi — jangan ditafsirkan sebagai sinyal real-time */
          if (demote) {
            var lastT = (r && r.data && r.data.length) ? r.data[r.data.length - 1].time : null;
            var barDate = lastT ? new Date(lastT * 1000).toISOString().slice(0, 10) : '';
            h += '<div style="color:var(--warn);font-size:12px;margin-top:8px">Data penutupan terakhir: <b>' + (barDate || '—') + '</b>. Market ' + (mInfo ? mInfo.label : '') + ' — evaluasi ulang saat pasar buka.</div>';
          }
          bodyEl.innerHTML = h;
          /* ledakan visual kecil saat keputusan berganti */
          try { bodyEl.style.transition = 'none'; bodyEl.style.opacity = '.2'; void bodyEl.offsetWidth; bodyEl.style.transition = 'opacity .3s'; bodyEl.style.opacity = '1'; } catch (e) {}
        }).catch(function (err) {
          if (bodyEl) bodyEl.innerHTML = '<div style="text-align:center;padding:10px;color:var(--warn);font-size:13px">Tidak bisa ambil data pasar (offline/CORS). Coba lagi dalam beberapa saat.</div>';
          if (window.console) console.error('Signal fetch gagal:', err && err.message);
        });
      })(confBody, activeXau);
    }
  }

  function showSignalNotification(s) {
    try {
      var title = (s.side === 'long' ? '🟢 BUY' : '🔴 SELL') + ' — ' + s.symbol;
      var body = s.strategy.toUpperCase() + ' → ' + (s.side === 'long' ? 'BUY' : 'SELL') + ' @ ' + s.price;
      if (s.confluence != null) body += '\nKonfluensi: ' + s.confluence + '% (' + s.verdict + ')';
      if (s.edgeScore) body += '\nKekuatan: ' + s.edgeScore;
      if (s.regime) body += '\nRegime: ' + s.regime;
      if (s.gate) body += '\n⚠ ' + s.gate;
      if (s.reasons && s.reasons.length) body += '\n' + s.reasons.slice(0, 3).join(' · ');
      if (s.sessionOpen === false) body += '\n⛔ MARKET TUTUP — data ' + (s.barDate || 'tersedia') + ', bukan sinyal real-time saat pasar buka.';
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        var n = new Notification(title, { body: body, tag: 'cangcilung-signal' });
        n.onclick = function () { try { window.focus(); n.close(); } catch (e) {} };
      }
    } catch (e) {}
  }
  // minta izin notifikasi sistem sekali (dipicu saat live signal diaktifkan/tombol panel)
  function requestSignalPermission() {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'denied') return;
      if (Notification.permission !== 'granted') Notification.requestPermission();
    } catch (e) {}
  }

  function startSignalChecker() {
    if (window.__signalTimer) return;
    function st() {
      if (!window.CC || !window.CC.ta || !window.CC.ta.listSignalAlerts) return;
      if (signalChecking) return;
      var sigs = window.CC.ta.listSignalAlerts();
      if (!sigs.length) return;
      var checked = {};
      var ta = window.CC.ta;
      sigs.forEach(function (s) {
        if (checked[s.symbol]) return;
        checked[s.symbol] = true;
        signalChecking = true;
        ta.fetchYahoo(s.symbol, '1d').then(function (r) {
          var res = ta.checkSignalAlerts(r);
          res.fired.forEach(function (f) {
            var confTxt = f.confluence != null ? ' · konfluensi ' + f.confluence + '% (' + f.verdict + ')' : '';
            var gateTxt = f.gate ? ' · ' + f.gate : '';
            /* market tutup (Sabtu/Minggu/libur): info tetap, tapi diberi label jelas + tanpa suara alarm */
            var closedTxt = f.sessionOpen === false ? ' · ⚠️ MARKET TUTUP (' + (f.sessionLabel || '') + ') — data ' + (f.barDate || 'sebelumnya') : '';
            if (window.CC && window.CC.ui) window.CC.ui.showToast((f.side === 'long' ? '🟢 BUY' : '🔴 SELL') + ' ' + f.symbol + ' (' + f.strategy + ')' + confTxt + gateTxt + closedTxt + ' @ ' + f.price);
            showSignalNotification(f);
            if (f.sessionOpen !== false) playAlertSound();
          });
          signalChecking = false;
        }).catch(function () { signalChecking = false; });
      });
    }
    st();
    window.__signalTimer = setInterval(st, 60000);
  }

  function playAlertSound() {
    try {
      if (settings.soundEnabled === false) return;
      var ctx = window.__alertAudioCtx || (window.__alertAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
      var now = ctx.currentTime;
      [880, 660, 880].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.15 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.15);
      });
    } catch (e) {}
  }

  function showAlertNotification(f) {
    try {
      if (typeof Notification === 'undefined') return;
      if (Notification.permission === 'granted') {
        new Notification('🔔 Alert Harga: ' + f.symbol, {
          body: f.symbol + ' mencapai ' + f.price + (f.label ? ' (' + f.label + ')' : ''),
          tag: 'cangcilung-alert'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    } catch (e) {}
  }

  function startAlertChecker() {
    if (window.__alertTimer) return;
    function tick() {
      if (window.CC && window.CC.ta && window.CC.ta.listAlerts) {
        var alerts = window.CC.ta.listAlerts();
        if (!alerts.length) return;
        var checked = {};
        alerts.forEach(function (a) {
          if (checked[a.symbol] || alertChecking) return;
          checked[a.symbol] = true;
          alertChecking = true;
          var ta = window.CC.ta;
          ta.fetchYahoo(a.symbol, '1d').then(function (r) {
            var res = ta.checkAlerts(r);
            res.fired.forEach(function (f) {
              if (window.CC && window.CC.ui) window.CC.ui.showToast('🔔 Alert: ' + f.symbol + ' mencapai ' + f.price);
              playAlertSound();
              showAlertNotification(f);
            });
            alertChecking = false;
          }).catch(function () { alertChecking = false; });
        });
      }
    }
    tick();
    window.__alertTimer = setInterval(tick, 60000);
  }

  /* ---------- Machine Learning & Deep Learning (/ml & /ml-signal) ---------- */
  // Parsing opsi: engine:vanilla|tfjs, horizon:N, epochs:N, tf:on
  function parseMLOpts(arr) {
    var o = {};
    (arr || []).forEach(function (p) {
      var m = String(p).split(':');
      if (m.length === 2) {
        var k = m[0].toLowerCase();
        if (k === 'engine') o.engine = m[1].toLowerCase();
        else if (k === 'tf') o.engine = (m[1] === 'on' || m[1] === '1' || m[1] === 'true') ? 'tfjs' : 'vanilla';
        else if (k === 'horizon' && !isNaN(parseInt(m[1]))) o.horizon = parseInt(m[1]);
        else if (k === 'epochs' && !isNaN(parseInt(m[1]))) o.epochs = parseInt(m[1]);
      }
    });
    return o;
  }
  function finalizeMessage(out) {
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory(); renderHistory();
    busy = false; setSendUI(false); setStatus('');
  }
  function failMessage(bubble, err) {
    removeTyping(bubble);
    var msg = '⚠️ ML gagal: ' + (err.message || err);
    history.push({ role: 'assistant', content: msg, t: nowTime() });
    saveHistory();
    if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
    renderHistory();
    busy = false; setSendUI(false); setStatus('');
  }
  // /ml SYM — latih model arah (Model A) + laporan validasi.
  // Vanilla: training di-chunk (UI tidak beku), deterministik (seed 42) & hasil disimpan di
  // localStorage -> pemanggilan berikutnya langsung dari cache (instan, tanpa training ulang).
  function handleML(symbol, optsArr) {
    if (!window.CC || !window.CC.ml) { setStatus('ML tidak dimuat.', true); return; }
    if (!window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ml = window.CC.ml, ta = window.CC.ta;
    var opts = parseMLOpts(optsArr);
    busy = true; setSendUI(true);
    setStatus('Mengambil data ' + symbol + '...');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    ta.fetchYahoo(symbol, '1d').then(function (o) {
      if (!o || !o.data || o.data.length < 150) throw new Error('Data harian tidak cukup (< 150 bar)');
      var ds = ml.buildDatasets(o.data, opts);
      if (ds.error) throw new Error(ds.error);
      var canCache = opts.engine !== 'tfjs';
      var sig = ml.dataSig(o.data);
      var key = canCache ? ml.cacheKey(symbol, ds.H, ds.n, sig) : null;
      if (canCache) {
        var cache = ml.loadModelCache(key);
        if (cache && cache.st && cache.st.W1) {
          var m = ml.restoreMLP(cache.st);
          if (m) {
            var tr = ml.evalModel(ds.trainX.map(function (x) { return m.predictProb(x); }), ds.trainY);
            var te = ml.evalModel(ds.testX.map(function (x) { return m.predictProb(x); }), ds.testY, ds.trainY.filter(function (y) { return y === 1; }).length / ds.trainY.length);
            var repC = { ok: true, engine: 'vanilla', kind: m.kind, model: m, train: tr, test: te, scaler: ds.scaler, names: ds.names, ds: ds, H: ds.H, seed: opts.seed || 42, cached: true };
            return ml.formatMl(repC, symbol);
          }
        }
      }
      opts.onProgress = function (e, total) { setStatus('Training model ' + symbol + '... ' + e + '/' + total + ' epoch'); };
      return ml.trainDirection(o.data, opts).then(function (r) {
        if (r.error) return '⚠️ ' + r.error;
        if (canCache && r.engine === 'vanilla' && r.model && r.model._state) ml.saveModelCache(key, { st: r.model._state });
        return ml.formatMl(r, symbol);
      });
    }).then(finalizeMessage).catch(function (err) { failMessage(bubble, err); });
  }
  // /ml-signal SYM STRAT — prediksi arah (Model A) + skor sinyal TA (Model B, pakai hasil Model A)
  function handleMLSignal(symbol, strategy, rawParams) {
    if (!window.CC || !window.CC.ml) { setStatus('ML tidak dimuat.', true); return; }
    if (!window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ml = window.CC.ml, ta = window.CC.ta;
    var opts = parseMLOpts(rawParams);
    busy = true; setSendUI(true);
    setStatus('Menganalisis arah ' + symbol + ' dengan ML...');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    opts.onProgress = function (e, total) { setStatus('Training model arah... ' + e + '/' + total + ' epoch'); };
    ta.fetchYahoo(symbol, '1d').then(function (o) {
      if (!o || !o.data || o.data.length < 150) throw new Error('Data harian tidak cukup (< 150 bar)');
      removeTyping(bubble);
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      return ml.predictDirection(o.data, opts).then(function (p) {
        if (p.error) return '⚠️ ' + p.error;
        var sOpts = Object.assign({}, opts, { pre: p });
        return ml.scoreSignal(o.data, strategy, null, sOpts).then(function (s) {
          return ml.formatPredict(p, symbol) + '\n\n' + (s.error ? '⚠️ ' + s.error : ml.formatSignalScore(s, symbol));
        });
      });
    }).then(finalizeMessage).catch(function (err) { failMessage(bubble, err); });
  }

  /* ---- Skills & Bundles (pola MANTRA: katalog + bundel terurut) ----
     Data + rekomendasi murni diekstrak ke lib/mantra.js. */
  var MANTRA = window.cangcilungMantra || {};
  var SKILLS = MANTRA.SKILLS || {};
  var BUNDLES = MANTRA.BUNDLES || {};
  function executeSkill(handler, args) {
    switch (handler) {
      case 'ta': return handleTA((args[0] || 'XAUUSD'));
      case 'chart': return handleChart((args[0] || 'XAUUSD'), (args[1] || '1d'));
      case 'rsi': return handleRSI((args[0] || 'XAUUSD'), (parseInt(args[1]) || 14));
      case 'structure': return handleStructure((args[0] || 'XAUUSD'));
      case 'session': return handleSessionCommand();
      case 'profile': return handleProfile((args[0] || 'XAUUSD'), (args[1] || '1d'));
      case 'risk': return handleRisk((args[0] || 'XAUUSD'), (parseFloat(String(args[1] || '10000').replace(/,/g, '')) || 10000), (parseFloat(args[2]) || 1));
      case 'corr': return handleCorrelation((args[0] || 'XAUUSD'));
      case 'backtest': return handleBacktest((args[0] || 'XAUUSD'), (args[1] || 'adaptive'), (args[2] || ''));
      case 'news': return handleNews((args[0] || 'XAUUSD'));
      case 'alert': return handleAlertAdd((args[0] || 'XAUUSD'), (args[1] || ''), '');
      case 'alerts': return handleAlertsList();
      case 'signal': return handleSignalAdd((args[0] || 'XAUUSD'), (args[1] || 'adaptive'), [].concat(args[2] || []));
      case 'signal-test': return handleSignalTest();
      case 'signals': return handleSignalList();
      case 'signal-del': return handleSignalDelete(args[0] || '');
      case 'signal-clear': return handleSignalClear();
      case 'ml': return handleML((args[0] || 'XAUUSD'), [].concat(args.slice(1)));
      case 'ml-signal': return handleMLSignal((args[0] || 'XAUUSD'), (args[1] || 'adaptive'), [].concat(args.slice(2)));
      default: return false;
    }
  }
  function bundleRecommend(text) {
    return MANTRA.bundleRecommend ? MANTRA.bundleRecommend(text, SKILLS, BUNDLES) : null;
  }
  function bundleSuggest(text, symbol) {
    var bn = bundleRecommend(text || '');
    if (!bn) return '';
    return renderBundle(bn, (symbol || 'XAUUSD').toUpperCase(), bn === 'analisa' ? 'ta' : null);
  }
  function renderBundle(bundleName, symbol, triggerSkill) {
    var b = BUNDLES[bundleName];
    if (!b) return '';
    var out = '\n\n### 🧩 Bundel (alur ' + bundleName + ')\n';
    out += b.desc + '\n';
    var seq = b.skills.map(function (s) {
      var line = SKILLS[s].cmd.replace('SYM', symbol).replace('TF', '1h').replace('N', '14').replace('ACC', '10000').replace('PCT', '1');
      return '- `' + line + '` — ' + SKILLS[s].desc;
    }).join('\n');
    out += seq;
    if (triggerSkill) out += '\n\n> 💡 Mulai dari `' + triggerSkill + '` (sudah dijalankan). Lanjutkan dengan langkah berikutnya untuk analisis menyeluruh.';
    return out;
  }
  function pushMessage(content) {
    history.push({ role: 'assistant', content: content, t: nowTime() });
    saveHistory();
    renderHistory();
    busy = false;
    setSendUI(false);
    setStatus('');
  }
  function handleSkillsCommand(raw) {
    var rest = (raw || '').replace(/^\/skills/, '').trim();
    var arg = rest.split(/\s+/).filter(Boolean);
    var symbol = 'XAUUSD';
    var mSym = raw.match(/\b(xau(?:usd)?|gold|emas|ndx|nasdaq|dji|dow|us30|spx|dxy|vix)\b/i);
    if (mSym) { symbol = mSym[1].toUpperCase(); if (symbol === 'S&P' || symbol === 'SPX') symbol = 'SPX'; if (symbol === 'XAU' || symbol === 'XAUUSD' || symbol === 'GOLD' || symbol === 'EMAS') symbol = 'XAUUSD'; if (symbol === 'NDX' || symbol === 'NASDAQ') symbol = 'NDX'; if (symbol === 'DJI' || symbol === 'DOW' || symbol === 'US30') symbol = 'US30'; }
    var bundleName = arg[1] && BUNDLES[arg[1].toLowerCase()] ? arg[1].toLowerCase() : (arg[0] && BUNDLES[arg[0].toLowerCase()] ? arg[0].toLowerCase() : null);
    var skillName = null;
    if (!bundleName && arg[0] && SKILLS[arg[0].toLowerCase()]) skillName = arg[0].toLowerCase();
    if (bundleName) {
      var trigger = bundleName === 'analisa' ? 'ta' : bundleName === 'risiko' ? 'risk' : bundleName === 'teknikal' ? 'rsi' : bundleName === 'berita' ? 'news' : 'backtest';
      executeSkill(trigger, [symbol]);
      return;
    }
    if (skillName) {
      executeSkill(skillName, [symbol, arg[1], arg[2]]);
      return;
    }
    var out = '## 🧩 Katalog Skill & Bundel\n\n### Perintah (skill)\n';
    Object.keys(SKILLS).forEach(function (n) { out += '- `/skills ' + n + ' SYM` → `' + SKILLS[n].cmd + '` — ' + SKILLS[n].desc + '\n'; });
    out += '\n### Bundel (alur terurut)\n';
    Object.keys(BUNDLES).forEach(function (n) { out += '- `/skills ' + n + ' SYM` — ' + BUNDLES[n].desc + '\n'; });
    out += '\nContoh: `/skills analisa XAUUSD` (tren → struktur → risiko). Ketik `/help` untuk daftar lengkap.';
    pushMessage(out);
  }
  function handleHelpCommand() {
    var out = '## Perintah CangCilung 📊\n\n';
    out += '> 🔒 Cangcilung **fokus khusus XAUUSD (emas)** — semua analisis trading otomatis memakai XAUUSD.`\n';
    out += '### Trading / Market\n';
    out += '- `/ta XAUUSD` — analisis lengkap semua indikator + SMC + verdict\n';
    out += '- `/rekomendasi XAUUSD` — arah (BUY/SELL/WATCH) + entry/SL/TP/RR\n';
    out += '- `/chart XAUUSD 1h` — tampilkan chart (interval: 5m/15m/30m/1h/1d/1w)\n';
    out += '- `/rsi XAUUSD 14` — RSI + MACD + BB\n';
    out += '- `/structure XAUUSD` — market structure (HH/HL/LH/LL)\n';
    out += '- `/mtf XAUUSD` — dashboard struktur multi-timeframe (BOS/CHoCH searah?)\n';
    out += '- `/session` — sesi market aktif & jadwal\n';
    out += '- `/profile XAUUSD 1h` — volume profile (POC/HVN/LVN)\n';
    out += '- `/risk XAUUSD 10000 1` — risk management (SL/TP/lot)\n';
    out += '- `/corr XAUUSD` — korelasi XAU vs DXY (atau NDX vs VIX)\n';
    out += '- `/backtest XAUUSD rsi 14:70:30` — uji strategi (rsi/bb/sma/ema/vwap/ma/smc/cvd/all/adaptive) + Sharpe + heatmap hari/jam + **Monte Carlo & stress-test otomatis**\n';
    out += '  · ⭐ `adaptive` = otomatis memilih strategi terbaik per kondisi market (NAIK→all-long, TURUN→smc, RANGE→bb) & jadi default\n';
    out += '  · opsional `cost:N` utk biaya per trade (mis. `cost:0.5`) agar hasil lebih realistis\n';
    out += '  · opsional `costModel:session spreadBase:0.25 commission:0.1` — biaya memakai spread emas dinamis per sesi (Asia>Eropa>NY) + komisi\n';
    out += '  · opsional `tf:1h` (atau `tf:5m/15m/30m/1d/1w`) — timeframe data backtest\n';
    out += '  · tambah `oos` utk validasi anti-overfitting (uji data terbaru)\n';
    out += '- `/news XAUUSD` atau `/berita XAUUSD` — sentimen berita terbaru\n';
    out += '- `/alert XAUUSD 3200` — pasang alert harga\n';
    out += '- `/alerts` — lihat alert aktif · `/alert-del <id>` — hapus\n';
    out += '- `/sinyal XAUUSD rsi` — pantau live signal BUY/SELL + konfluensi, regime & kekuatan (rsi/bb/sma/ema/vwap/ma/smc/cvd/all/adaptive)\n';
    out += '  · opsional `period:14:70:30` utk parameter (mis. `period:9:70:30`)\n';
    out += '  · `/sinyal-list` lihat aktif · `/sinyal-history` riwayat · `/sinyal-del <id>` hapus · `/sinyal-clear` bersihkan · `/sinyal-test` uji notifikasi\n';
    out += '### Machine Learning / Deep Learning (baru) 🧠\n';
    out += '- `/ml XAUUSD` — latih neural network di browser (TensorFlow.js online / fallback offline) → prediksi arah harga + laporan validasi OOS (anti-overfit)\n';
    out += '  · deterministik (seed 42) + hasil **disimpan** (panggil ulang → instan dari cache)\n';
    out += '  · opsional `engine:vanilla` (offline murni JS & tanpa CDN) · `horizon:N` (default 3) · `epochs:N`\n';
    out += '- `/ml-signal XAUUSD rsi` — prediksi arah ML + probabilitas sinyal TA (BUY/SELL) saat ini benar (rsi/bb/sma/ema/vwap/ma/smc/cvd/all/adaptive)\n';
    out += '  · contoh: `/ml-signal XAUUSD adaptive` · `/ml XAUUSD engine:vanilla`\n\n';
    out += '### Bundel (alur analisis, baru)\n';
    out += '- `/skills` — katalog skill & bundel\n';
    out += '- `/skills analisa XAUUSD` — tren → struktur → risiko\n';
    out += '- `/skills risiko XAUUSD` — posisi → korelasi → alert\n';
    out += '- `/skills teknikal XAUUSD` — indikator → chart → profile\n';
    out += '- `/skills berita XAUUSD` — sentimen → bias harga\n';
    out += '- `/skills sinyal XAUUSD` — backtest → alert\n\n';
    out += 'Simbol: `XAUUSD`, `NDX`, `US30`, `SPX`, `DXY`, `VIX`\n\n';
    out += '### Umum: ketik `help` untuk bantuan AI';
    history.push({ role: 'assistant', content: out, t: nowTime() });
    saveHistory();
    renderHistory();
    busy = false;
    setSendUI(false);
    setStatus('');
  }

  function handleStructure(symbol) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ta = window.CC.ta;
    busy = true; setSendUI(true);
    setStatus('Analisis struktur market ' + symbol + '...');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    ta.fetchYahoo(symbol, '1d').then(function (result) {
      var ms = ta.detectMarketStructure(result.data);
      var session = ta.getCurrentSession();
      var out = '## Market Structure ' + symbol.toUpperCase() + '\n';
      out += '**Struktur:** ' + ms.structure + '\n\n';
      out += '- HH: ' + ms.hh + ' | HL: ' + ms.hl + ' | LH: ' + ms.lh + ' | LL: ' + ms.ll + '\n';
      out += '- Swing High terakhir: ' + ms.swingHighs.slice(-3).map(function (s) { return s.price.toFixed(2); }).join(' → ') + '\n';
      out += '- Swing Low terakhir: ' + ms.swingLows.slice(-3).map(function (s) { return s.price.toFixed(2); }).join(' → ') + '\n';
      out += '- Sesi: ' + session.label + '\n';
      removeTyping(bubble);
      history.push({ role: 'assistant', content: out, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false; setSendUI(false); setStatus('');
    }).catch(function (err) {
      removeTyping(bubble); busy = false; setSendUI(false); setStatus('');
      history.push({ role: 'assistant', content: '⚠️ Gagal: ' + (err.message || err), t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
    });
  }

  function handleStructureMtf(symbol) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ta = window.CC.ta;
    busy = true; setSendUI(true);
    setStatus('Dashboard struktur multi-timeframe ' + symbol + '...');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    ta.fetchMultiTF(symbol).then(function (m) {
      var tfs = {};
      tfs['1D'] = m['1d'] ? m['1d'].data : null;
      tfs['1H'] = m['1h'] ? m['1h'].data : null;
      tfs['M15'] = m['15m'] ? m['15m'].data : null;
      var dash = ta.mtfStructureDashboard({ tfs: tfs });
      var out = '## Struktur Multi-Timeframe ' + symbol.toUpperCase() + '\n';
      out += 'Kesepakatan arah struktur antar timeframe (BOS/CHoCH + trend):\n\n';
      out += '| Pasangan | Timeframe tinggi | Timeframe rendah | Status |\n';
      out += '|----------|------------------|------------------|--------|\n';
      dash.rows.forEach(function (row) {
        var icon = row.align === true ? '✅ ✓' : row.align === false ? '❌ ✗' : '—';
        out += '| ' + row.pair + ' | ' + row.hiBias + ' | ' + row.loBias + ' | ' + (row.label) + ' ' + icon + ' |\n';
      });
      out += '\n**Kesimpulan:** ' + dash.verdict + ' (agreement ' + (dash.agreement >= 0 ? '+' : '') + dash.agreement + ')';
      out += '\n\n>Strategi paling sehat umumnya saat semua timeframe **searah**. Bila divergen, pertimbangkan menunggu atau berhenti (stand-aside).';
      removeTyping(bubble);
      history.push({ role: 'assistant', content: out, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false; setSendUI(false); setStatus('');
    }).catch(function (err) {
      removeTyping(bubble); busy = false; setSendUI(false); setStatus('');
      history.push({ role: 'assistant', content: '⚠️ Gagal: ' + (err.message || err), t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
    });
  }

  function handleRisk(symbol, accSize, riskPct) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ta = window.CC.ta;
    busy = true; setSendUI(true);
    setStatus('Kalkulasi risk management ' + symbol + '...');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    ta.fetchYahoo(symbol, '1d').then(function (result) {
      var rm = ta.calcRiskManagement(result.data, accSize, riskPct);
      var out = '## Risk Management ' + symbol.toUpperCase() + '\n';
      out += 'Akun $' + accSize.toLocaleString() + ' | Risk ' + riskPct + '%\n';
      out += '- **Entry:** ' + rm.entry + '\n';
      out += '- **Stop Loss:** ' + rm.stopLoss + ' (' + rm.slDistance + ' dari entry)\n';
      out += '- **Take Profit:** ' + rm.takeProfit + ' (' + rm.tpDistance + ' dari entry)\n';
      out += '- **Risk:Reward:** 1 : ' + rm.riskReward + '\n';
      out += '- **Risk Amount:** $' + rm.riskAmount.toLocaleString() + '\n';
      out += '- **Lot Size (100oz):** ' + rm.lotSize + '\n';
      out += '- **ATR(14):** ' + rm.atr + '\n';
      removeTyping(bubble);
      history.push({ role: 'assistant', content: out, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false; setSendUI(false); setStatus('');
    }).catch(function (err) {
      removeTyping(bubble); busy = false; setSendUI(false); setStatus('');
      history.push({ role: 'assistant', content: '⚠️ Gagal: ' + (err.message || err), t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
    });
  }

  function handleCorrelation(symbol) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ta = window.CC.ta;
    busy = true; setSendUI(true);
    setStatus('Analisis korelasi ' + symbol + '...');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    Promise.all([ta.fetchYahoo(symbol, '1d'), ta.fetchCorrelation(symbol)]).then(function (r) {
      var main = r[0], corr = r[1];
      if (!corr) throw new Error('Tidak ada korelasi untuk ' + symbol + '. Gunakan /corr XAUUSD atau /corr NDX');
      var c = ta.calcCorrelation(main.data, corr.data);
      var mainLast = main.data[main.data.length - 1];
      var corrLast = corr.data[corr.data.length - 1];
      var out = '## Korelasi ' + main.name + ' vs ' + corr.name + '\n';
      out += '- Korelasi: **' + c.label + '**\n';
      out += '- ' + main.name + ': ' + mainLast.close.toFixed(2) + '\n';
      out += '- ' + corr.name + ': ' + corrLast.close.toFixed(2) + '\n\n';
      if (c.direction === 'negatif') out += '- Ini berarti saat ' + corr.name + ' naik, ' + main.name + ' cenderung turun (dan sebaliknya).';
      else out += '- Ini berarti saat ' + corr.name + ' naik, ' + main.name + ' cenderung ikut naik.';
      removeTyping(bubble);
      history.push({ role: 'assistant', content: out, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false; setSendUI(false); setStatus('');
    }).catch(function (err) {
      removeTyping(bubble); busy = false; setSendUI(false); setStatus('');
      history.push({ role: 'assistant', content: '⚠️ Gagal: ' + (err.message || err), t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
    });
  }

  function handleProfile(symbol, tf) {
    if (!window.CC || !window.CC.ta) { setStatus('TA tidak dimuat.', true); return; }
    var f = focusSym(symbol); if (f.forced) focusNote(f); symbol = f.s;
    var ta = window.CC.ta;
    busy = true; setSendUI(true);
    setStatus('Menghitung Volume Profile ' + symbol + '...');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    ta.fetchYahoo(symbol, tf || '1d').then(function (result) {
      var vp = ta.calcVolumeProfile(result.data);
      var last = result.data[result.data.length - 1];
      if (!vp) throw new Error('Data tidak cukup untuk Volume Profile');
      var out = '## Volume Profile ' + symbol.toUpperCase() + ' (' + (tf || '1d') + ')\n';
      out += '- **POC:** ' + vp.poc.mid.toFixed(2) + ' (harga ' + (last.close > vp.poc.mid ? 'di atas' : 'di bawah') + ' POC)\n';
      out += '- **High Volume Nodes (HVN):** ' + vp.hvn.slice(0, 4).map(function (h) { return h.mid.toFixed(2) + ' (' + h.volume + ')'; }).join(' | ') + '\n';
      out += '- **Low Volume Nodes (LVN):** ' + vp.lvn.slice(0, 4).map(function (l) { return l.mid.toFixed(2) + ' (' + l.volume + ')'; }).join(' | ') + '\n';
      out += '- **Value Area:** ' + vp.valueArea[0].low.toFixed(2) + ' - ' + vp.valueArea[vp.valueArea.length - 1].high.toFixed(2) + '\n\n';
      out += 'HVN = area hemat keuntungan (support/resistance kuat). LVN = area magnet (harga bergerak cepat).';
      removeTyping(bubble);
      history.push({ role: 'assistant', content: out, t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
      busy = false; setSendUI(false); setStatus('');
    }).catch(function (err) {
      removeTyping(bubble); busy = false; setSendUI(false); setStatus('');
      history.push({ role: 'assistant', content: '⚠️ Gagal: ' + (err.message || err), t: nowTime() });
      saveHistory();
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      renderHistory();
    });
  }


  function addUserMessage(text) {
    if (editingIndex >= 0) {
      var ei = editingIndex;
      editingIndex = -1;
      history[ei] = { role: 'user', content: text, t: history[ei].t || nowTime() };
      history = history.slice(0, ei + 1);
      _renderedCount = 0;
    } else {
      history.push({ role: 'user', content: text, t: nowTime() });
      trackTopic(text);
      autoTitle(text);
    }
    saveHistory();
    renderHistory();
  }

  function sendChat() {
    var input = $('chat-input');
    var text = (input && input.value || '').trim();
    if (/^\/(alerts|alert|alert-del|help|session|skills)/i.test(text)) {
      input.value = '';
      if (/^\/help\b/i.test(text)) { handleHelpCommand(); return; }
      if (/^\/skills\b/i.test(text)) { handleSkillsCommand(text); return; }
      if (/^\/session\b/i.test(text)) { handleSessionCommand(); return; }
      if (/^\/alert-del\b/i.test(text)) { handleAlertDelete(text.replace(/^\/alert-del\s*/i, '').trim()); return; }
      if (/^\/alerts\b/i.test(text)) { handleAlertsList(); return; }
      if (/^\/alert\b/i.test(text)) {
        var am = text.match(/^\/alert\s+(\S+)\s+(\S+)(?:\s+(.+))?/i);
        handleAlertAdd(am && am[1] ? am[1] : 'XAUUSD', am && am[2] ? am[2] : '', am && am[3] ? am[3].trim() : '');
        return;
      }
      return;
    }
    if (busy) {
      kbCancel = true;
      webFetching = false;
      if (webProgressId) { clearInterval(webProgressId); webProgressId = null; }
      if (abortCtrl) abortCtrl.abort();
      else { busy = false; setSendUI(false); setStatus('⏹ Dihentikan.'); }
      return;
    }
    kbCancel = false;
    var webProgressId = null;
    var input = $('chat-input');
    var text = input.value.trim();
    _taSuggestText = text;
    if (/^\/(chart|grafik)\b/i.test(text)) {
      var m = text.match(/^\/(?:chart|grafik)\s+(\S+)\s*(\S*)/i);
      var sym = m ? m[1] : 'XAUUSD';
      var iv = m && m[2] ? m[2] : '1d';
      input.value = '';
      handleChart(sym, iv);
      return;
    }
    if (/^\/rsi\b/i.test(text)) {
      var m = text.match(/^\/rsi\s+(\S+)\s*(\d*)/i);
      var sym = m ? m[1] : 'XAUUSD';
      var period = m && m[2] ? parseInt(m[2]) : 14;
      input.value = '';
      handleRSI(sym, period);
      return;
    }
    if (/^\/(ta|analyze|analisa)\s*(xau|gold|emas|ndx|nasdaq|dji|dow|spx|dxy|vix|us30|s&p)/i.test(text)) {
      var m = text.match(/^\/(?:ta|analyze|analisa)\s+(\S+)/i);
      var sym = m ? m[1] : 'XAUUSD';
      input.value = '';
      handleTA(sym);
      return;
    }
    if (/^\/(rekomendasi|rekom|rec|signal)\b/i.test(text)) {
      var m = text.match(/^\/(?:rekomendasi|rekom|rec|signal)\s+(\S+)/i);
      var sym = m && m[1] ? m[1] : 'XAUUSD';
      input.value = '';
      handleRekomendasi(sym);
      return;
    }
    var taIntent = text.match(/(analisa|analisis|analyse|analyze|prediksi|ramal|proyeksi|forecast|breakout|breakdown|resistance|support|candlestick|sinyal (?:beli|jual)|momentum|trend(?:line)?)/i);
    var taSymbol = /(xau(?:usd)?|gold|emas|ndx|nasdaq|ixic|dji|dow\b|djia|spx|s&p|dxy|dollar index|vix|us30)/i;
    var taSym = text.match(taSymbol);
    var taDir = /(melesat|anjlok|menguat|melemah|breakout|breakdown|naik apa turun|naik atau turun|akan naik|akan turun|naik nggak|turun gak|turun nggak|harga (?:emas|gold|ndx|nasdaq|dji|dow|spx|s&p|naik|turun|hari ini|sekarang)\b|(?:emas|gold|ndx|nasdaq|dji|dow|spx|s&p)\s+(?:naik\??|turun\??|menguat\??|melemah\??))/i;
    var taHasDir = taDir.test(text);
    var taNotDef = /\b(kenapa|why|sejarah|history|contoh|contohnya|inflasi|misal|misalnya|kapan|semenjak|belajar|tutorial|arti|apa itu|definisi|pengertian|jelaskan apa)\b/i;
    if (taSym && taSym[1] && text.length <= 80 && taIntent && !taNotDef.test(text)) {
      var sym = taSym[1].toUpperCase();
      if (sym === 'S&P' || sym === 'SPX') sym = 'SPX';
      if (sym === 'XAU' || sym === 'XAUUSD' || sym === 'GOLD' || sym === 'EMAS') sym = 'XAUUSD';
      if (sym === 'NDX' || sym === 'NASDAQ' || sym === 'IXIC') sym = 'NDX';
      if (sym === 'DJI' || sym === 'DJIA' || sym === 'DOW' || sym === 'US30') sym = 'US30';
      if (sym === 'DOLLAR INDEX' || sym === 'DXY') sym = 'DXY';
      input.value = '';
      handleTA(sym);
      return;
    }
    if (taSym && taSym[1] && taHasDir && text.length <= 70 && !taNotDef.test(text)) {
      var sym = taSym[1].toUpperCase();
      if (sym === 'S&P' || sym === 'SPX') sym = 'SPX';
      if (sym === 'XAU' || sym === 'XAUUSD' || sym === 'GOLD' || sym === 'EMAS') sym = 'XAUUSD';
      if (sym === 'NDX' || sym === 'NASDAQ' || sym === 'IXIC') sym = 'NDX';
      if (sym === 'DJI' || sym === 'DJIA' || sym === 'DOW' || sym === 'US30') sym = 'US30';
      if (sym === 'DOLLAR INDEX' || sym === 'DXY') sym = 'DXY';
      input.value = '';
      handleTA(sym);
      return;
    }
    if (/^\/(structure|struktur)\b/i.test(text)) {
      var m = text.match(/^\/(?:structure|struktur)\s+(\S+)/i);
      var sym = m ? m[1] : 'XAUUSD';
      input.value = '';
      handleStructure(sym);
      return;
    }
    if (/^\/(structure-mtf|struktur-mtf|strmtf|mtf)\b/i.test(text)) {
      var m = text.match(/^\/(?:structure-mtf|struktur-mtf|strmtf|mtf)\s+(\S+)/i);
      var sym = m ? m[1] : 'XAUUSD';
      input.value = '';
      handleStructureMtf(sym);
      return;
    }
    if (/^\/(risk|rm)\b/i.test(text)) {
      var m = text.match(/^\/(?:risk|rm)\s+(\S+)(?:\s+([\d,.]+))?(?:\s+([\d.]+))?/i);
      var sym = m && m[1] ? m[1] : 'XAUUSD';
      var acc = m && m[2] ? parseFloat(String(m[2]).replace(/,/g, '')) : 10000;
      var riskPct = m && m[3] ? parseFloat(m[3]) : 1;
      input.value = '';
      handleRisk(sym, acc, riskPct);
      return;
    }
    if (/^\/(corr|correlation)\b/i.test(text)) {
      var m = text.match(/^\/(?:corr|correlation)\s+(\S+)/i);
      var sym = m ? m[1] : 'XAUUSD';
      input.value = '';
      handleCorrelation(sym);
      return;
    }
    if (/^\/(profile|vp|volume|vol)\b/i.test(text)) {
      var m = text.match(/^\/(?:profile|vp|volume|vol)\s+(\S+)\s*(\S*)/i);
      var sym = m && m[1] ? m[1] : 'XAUUSD';
      var tf = m && m[2] ? m[2] : '1d';
      input.value = '';
      handleProfile(sym, tf);
      return;
    }
    if (/^\/session\b/i.test(text)) {
      input.value = '';
      handleSessionCommand();
      return;
    }
    if (/^\/alert-del\b/i.test(text)) {
      var id = text.replace(/^\/alert-del\s*/i, '').trim();
      input.value = '';
      handleAlertDelete(id);
      return;
    }
    if (/^\/alerts\b/i.test(text)) {
      input.value = '';
      handleAlertsList();
      return;
    }
    if (/^\/alert\b/i.test(text)) {
      var m = text.match(/^\/alert\s+(\S+)\s+(\S+)(?:\s+(.+))?/i);
      var sym = m && m[1] ? m[1] : 'XAUUSD';
      var target = m && m[2] ? m[2] : '';
      var label = m && m[3] ? m[3].trim() : '';
      input.value = '';
      handleAlertAdd(sym, target, label);
      return;
    }
    if (/^\/sinyal-test\b/i.test(text)) {
      input.value = '';
      handleSignalTest();
      return;
    }
    if (/^\/(sinyal-history|sinyal-log|sinyalhist)\b/i.test(text)) {
      input.value = '';
      handleSignalHistory();
      return;
    }
    if (/^\/(sinyal-list|sinyals|livesignals|sig-list)\b/i.test(text)) {
      input.value = '';
      handleSignalList();
      return;
    }
    if (/^\/sinyal-clear\b/i.test(text)) {
      input.value = '';
      handleSignalClear();
      return;
    }
    if (/^\/(sinyal|livesignal|sig)\b/i.test(text)) {
      var sm = text.match(/^\/(?:sinyal|livesignal|sig)-del\s+(\S+)/i);
      if (sm) { input.value = ''; handleSignalDelete(sm[1]); return; }
      var sm2 = text.match(/^\/(?:sinyal|livesignal|sig)\s+(\S+)\s*([a-z]+)?\s*(.*)/i);
      input.value = '';
      handleSignalAdd(sm2 && sm2[1] ? sm2[1] : 'XAUUSD', sm2 && sm2[2] ? sm2[2].toLowerCase() : 'adaptive', (sm2 && sm2[3] ? sm2[3].trim().split(/\s+/).filter(Boolean) : []));
      return;
    }
    if (/^\/(news|berita)\b/i.test(text)) {
      var m = text.match(/^\/(?:news|berita)\s+(\S+)/i);
      var sym = m && m[1] ? m[1] : 'XAUUSD';
      input.value = '';
      handleNews(sym);
      return;
    }
    if (/^\/backtest\b/i.test(text)) {
      var m = text.match(/^\/backtest\s+(\S+)\s+(\S+)\s*(.*)/i);
      var sym = m && m[1] ? m[1] : 'XAUUSD';
      var strat = m && m[2] ? m[2].toLowerCase() : 'adaptive';
      var rawParams = m && m[3] ? m[3].trim().split(/\s+/).filter(Boolean) : [];
      input.value = '';
      handleBacktest(sym, strat, rawParams);
      return;
    }
if (/^\/ml-signal\b/i.test(text)) {
      var mms = text.match(/^\/ml-signal\s+(\S+)\s*([a-z]+)?\s*(.*)/i);
      input.value = '';
      handleMLSignal(mms && mms[1] ? mms[1] : 'XAUUSD', mms && mms[2] ? mms[2].toLowerCase() : 'adaptive', (mms && mms[3] ? mms[3].trim().split(/\s+/).filter(Boolean) : []));
      return;
    }
    if (/^\/ml\b/i.test(text)) {
      var mm = text.match(/^\/ml\s+(\S+)?\s*(.*)/i);
      input.value = '';
      handleML(mm && mm[1] ? mm[1] : 'XAUUSD', (mm && mm[2] ? mm[2].trim().split(/\s+/).filter(Boolean) : []));
      return;
    }
    if (/^\/help\b/i.test(text)) {
      input.value = '';
      handleHelpCommand();
      return;
    }
    if (/^\/skills\b/i.test(text)) {
      input.value = '';
      handleSkillsCommand(text);
      return;
    }
    /* ── CangCilung = konsol ML & DL signal trading ── */
    /* Perintah natural-language TA (mis. "analisis XAUUSD") sudah ditangkap
       di atas. Sisanya = teks bebas → tayang bantuan perintah trading.
       Jalur LLM/chat (di bawah, setelah titik ini) TIDAK PERNAH dijangkau. */
    if (/^\/analyze\b/i.test(text)) {
      var am = text.match(/^\/analyze\s+(\S+)/i);
      input.value = '';
      handleTA(am && am[1] ? am[1] : 'XAUUSD');
      return;
    }
    if (!text) return;
    if (busy) { if (abortCtrl) abortCtrl.abort(); else { busy = false; setSendUI(false); setStatus('⏹ Dihentikan.'); } return; }

    addUserMessage(text);

    finalizeMessage(
      'CangCilung adalah platform **ML & DL signal trading** — fitur chat/LLM sudah dihapus.\n\n' +
      'Gunakan salah satu perintah berikut:\n\n' +
      '- `/chart [SYM] [TF]` — grafik candlestick (mis. `/chart XAUUSD 1h`)\n' +
      '- `/rsi [SYM] [periode]` — indikator RSI\n' +
      '- `/ta [SYM]` — analisis teknikal lengkap\n' +
      '- `/rekomendasi [SYM]` — keputusan BUY/SELL/WAIT\n' +
      '- `/ml [SYM] [engine:vanilla|tfjs] [epochs]` — latih model Machine/Deep Learning\n' +
      '- `/ml-signal [SYM] [strategi]` — sinyal fusion ML×TA\n' +
      '- `/backtest [SYM] [strategi] [opts]` — backtest + walk-forward + Monte Carlo\n' +
      '- `/structure [SYM]` • `/structure-mtf [SYM]` — market structure (MTF)\n' +
      '- `/news [SYM]` — sentimen berita\n' +
      '- `/risk [SYM] [akun] [persen]` — manajemen risiko\n' +
      '- `/corr [SYM]` — korelasi antar aset\n' +
      '- `/profile [SYM]` — volume profile\n' +
      '- `/sinyal [SYM] [strategi]` — tambah signal live\n' +
      '- `/sinyal-list` • `/sinyal-history` • `/sinyal-clear` — kelola signal\n' +
      '- `/alerts` • `/alert SYM target label` — alert harga\n' +
      '- `/skills` — skills & bundle trading (mantra)\n' +
      '- `/help` — daftar lengkap perintah\n\n' +
      'Panel **Live Signal 📶** ada di tombol header atas.'
    );
    return;
  }

  function openSettings() {
    var st = $('set-status');
    if (st) st.textContent = '';
    if ($('set-news-key')) $('set-news-key').value = settings.newsKey || '';
    openModal('settings-modal');
    if ($('set-news-key')) $('set-news-key').focus();
  }

  function closeSettings() {
    closeModal('settings-modal');
  }

  function saveSettingsFromModal() {
    if ($('set-news-key')) settings.newsKey = $('set-news-key').value.trim();
    saveSettings();
    connSub();
    closeSettings();
    setStatus('Pengaturan disimpan.');
  }



  var modalStack = [];

  function openModal(id) {
    var el = $(id);
    if (!el) return;
    modalStack.push({ id: id, opener: document.activeElement });
    closeToolsMenu();
    el.hidden = false;
    var f = el.querySelector('input, select, textarea, button:not(.modal-close)');
    if (f) f.focus();
  }

  function closeModal(id) {
    var el = $(id);
    if (!el) return;
    el.hidden = true;
    for (var i = modalStack.length - 1; i >= 0; i--) {
      if (modalStack[i].id === id) {
        var opener = modalStack[i].opener;
        modalStack.splice(i, 1);
        if (opener && typeof opener.focus === 'function') {
          if (opener.offsetParent !== null || opener === document.body) opener.focus();
          else { var tb = $('btn-tools'); if (tb) tb.focus(); }
        }
        break;
      }
    }
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      if (!searchActive) toggleSearch();
      else { var inp = $('search-input'); if (inp) inp.focus(); }
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      var im = $('input-more-menu');
      if (im && !im.hidden) { closeInputMore(); return; }
      var menu = $('tools-menu');
      if (menu && !menu.hidden) { closeToolsMenu(); return; }
      if (searchActive) { toggleSearch(); return; }
      var opens = document.querySelectorAll('.modal-overlay:not([hidden])');
      if (opens.length) closeModal(opens[opens.length - 1].id);
      return;
    }
    if (e.key === 'Tab') {
      var opens = document.querySelectorAll('.modal-overlay:not([hidden])');
      if (!opens.length) return;
      var top = opens[opens.length - 1];
      var focusables = top.querySelectorAll('button, [href], input, select, textarea');
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function closeToolsMenu() {
    if (window.CC && window.CC.ui) return window.CC.ui.closeToolsMenu();
    var menu = $('tools-menu');
    if (menu) { menu.hidden = true; }
    var tb = $('btn-tools');
    if (tb) tb.setAttribute('aria-expanded', 'false');
  }

  function closeInputMore() {
    if (window.CC && window.CC.ui) return window.CC.ui.closeInputMore();
    var m = $('input-more-menu');
    if (m) { m.hidden = true; }
    var imb = $('btn-input-more');
    if (imb) imb.setAttribute('aria-expanded', 'false');
  }

  var confirmCb = null;

  function openConfirm(title, msg, okLabel, cb, icon) {
    $('confirm-title').textContent = title || 'Konfirmasi';
    $('confirm-msg').textContent = msg || '';
    $('btn-confirm-ok').textContent = okLabel || 'OK';
    var iconEl = $('confirm-icon');
    if (iconEl) iconEl.textContent = icon || '⚠️';
    confirmCb = cb;
    openModal('confirm-modal');
    $('btn-confirm-ok').focus();
  }

  function closeConfirm() {
    confirmCb = null;
    closeModal('confirm-modal');
  }

  function init() {
    initCrypto().then(function () { return decryptApiKey(); }).catch(function () {});
    loadSettings();
    loadSessions();
    loadHistory();
    loadSummary();
    loadMemory();
    window.addEventListener('beforeunload', function () { if (!window.__skipSave) saveSessionsNow(); });
    els.btnSend = $('btn-send');
    els.chatInput = $('chat-input');
    els.chatMessages = $('chat-messages');
    if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }
    connSub();
    var applyOnline = (function () {
      return function () {
        var cs = $('conn-sub');
        if (!cs) return;
        if (navigator.onLine === false) {
          cs.textContent = '📴 Offline — tanpa internet (chat mungkin tak tersedia)';
          cs.classList.add('offline');
        } else {
          cs.classList.remove('offline');
          connSub();
        }
      };
    })();
    window.addEventListener('offline', applyOnline);
    window.addEventListener('online', applyOnline);
    applyOnline();
    renderHistory();
    renderUsage();
    applyTheme(settings.theme);
    applyFont();

    /* ── Konsol perintah trading ── */
    var inp = $('chat-input');
    if (inp) {
      inp.addEventListener('input', updateInputCount);
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          sendChat();
        }
      });
    }
    var sendBtn = $('btn-send');
    if (sendBtn) sendBtn.addEventListener('click', sendChat);

    var themeBtn = $('btn-theme');
    if (themeBtn) { themeBtn.hidden = false; themeBtn.addEventListener('click', cycleTheme); }

    var signalBtn = $('btn-signal');
    if (signalBtn) signalBtn.addEventListener('click', openSignalPanel);

    var scrollBtn = $('btn-scroll-down');
    if (scrollBtn) scrollBtn.addEventListener('click', scrollToBottom);
    var messages = $('chat-messages');
    if (messages) messages.addEventListener('scroll', onChatScroll);

    /* ── Aksi pada bubble output (salin/edit/ulang/semat) ── */
    if (messages) messages.addEventListener('click', function (e) {
      var btn = e.target.closest('.bubble-act, .run-btn');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'run') {
        var pre = btn.closest('pre');
        var code = pre ? pre.querySelector('code') : null;
        if (code) runCode(code.textContent, pre);
        return;
      }
      var wrap = btn.closest('.msg');
      var idx = wrap && wrap.dataset.index != null ? parseInt(wrap.dataset.index) : null;
      if (action === 'copy') {
        var bbl = wrap ? wrap.querySelector('.msg-bubble') : null;
        copyText(bbl ? bbl.textContent : '');
      } else if (action === 'edit' && idx != null) { editMessage(idx); }
      else if (action === 'regenerate') { regenerateLast(); }
      else if (action === 'pin' && idx != null) { togglePin(idx); }
    });

    /* ── Modal Pengaturan ── */
    var settingsBtn = $('btn-settings');
    if (settingsBtn) { settingsBtn.hidden = false; settingsBtn.addEventListener('click', openSettings); }
    var setClose = $('btn-modal-close'), setCancel = $('btn-set-cancel'), setSave = $('btn-set-save');
    if (setClose) setClose.addEventListener('click', closeSettings);
    if (setCancel) setCancel.addEventListener('click', closeSettings);
    if (setSave) setSave.addEventListener('click', saveSettingsFromModal);
    var settingsModal = $('settings-modal');
    if (settingsModal) settingsModal.addEventListener('click', function (e) { if (e.target === settingsModal) closeSettings(); });

    /* ── Modal Konfirmasi ── */
    var okBtn = $('btn-confirm-ok');
    if (okBtn) okBtn.addEventListener('click', function () { if (confirmCb) { var cb = confirmCb; closeConfirm(); cb(); } });
    var cancelBtn = $('btn-confirm-cancel'), closeBtn = $('btn-confirm-close');
    if (cancelBtn) cancelBtn.addEventListener('click', closeConfirm);
    if (closeBtn) closeBtn.addEventListener('click', closeConfirm);
    var cfmModal = $('confirm-modal');
    if (cfmModal) cfmModal.addEventListener('click', function (e) { if (e.target === cfmModal) closeConfirm(); });

    /* ── Modal Chart / Panel Signal ── */
    var chartClose = $('btn-chart-close');
    if (chartClose) chartClose.addEventListener('click', function () { closeModal('chart-modal'); });
    var chartModal = $('chart-modal');
    if (chartModal) chartModal.addEventListener('click', function (e) { if (e.target === chartModal) closeModal('chart-modal'); });

    startAlertChecker();
    startSignalChecker();
    updateSignalBadge();
  }

  /** @type {Object} Public API for cloud.js, kb.js, and external consumers */
  window.cangcilung = {
    /** @returns {Array<Object>} Shallow copy of all sessions */
    getSessions: function () { return sessions.slice(); },
    /** @returns {Object} Current settings object (live reference) */
    getSettings: function () { return settings; },
    /** @returns {{ date: string, requests: number }} Today's usage stats */
    getUsage: loadUsage,
    /** @param {string} id - Modal element ID */
    openModal: openModal,
    /** @param {string} id - Modal element ID */
    closeModal: closeModal,
    /** @param {Array<Object>} arr - Cloud-synced sessions array */
    applyCloudSessions: function (arr) {
      if (!Array.isArray(arr)) return;
      sessions = arr;
      if (!sessions.some(function (s) { return s.id === currentSessionId; })) currentSessionId = sessions.length ? sessions[0].id : null;
      saveSessions();
      history = [];
      summary = '';
      var s = currentSession();
      if (s) { history = s.history.slice(); summary = s.summary || ''; }
      renderHistory();
      renderSessionList();
      renderPins();
      connSub();
    },
    /** @param {Object} s - Partial settings from cloud */
    applyCloudSettings: function (s) {
      if (!s) return;
      if (s.baseUrl !== undefined) settings.baseUrl = s.baseUrl;
      if (s.model) settings.model = DEPRECATED_MODELS.indexOf(s.model) >= 0 ? DEFAULT_MODEL : s.model;
      if (s.analyModel) settings.analyModel = s.analyModel;
      if (s.persona) settings.persona = s.persona;
      if (s.verifyEnabled !== undefined) settings.verifyEnabled = s.verifyEnabled;
      if (s.theme) settings.theme = s.theme;
      if (s.voice) settings.voice = s.voice;
      if (s.fontSize) settings.fontSize = s.fontSize;
      if (s.soundEnabled !== undefined) settings.soundEnabled = s.soundEnabled;
      if (s.suggestEnabled !== undefined) { settings.suggestEnabled = s.suggestEnabled; suggestEnabled = s.suggestEnabled; }
      if (s.embedBaseUrl) settings.embedBaseUrl = s.embedBaseUrl;
      if (s.embedModel) settings.embedModel = s.embedModel;
      if (s.memory && typeof s.memory === 'object') {
        var cloudMem = s.memory;
        if (cloudMem.prefs) memory.prefs = cloudMem.prefs;
        if (cloudMem.entities) {
          if (!memory.entities) memory.entities = { names: {}, dates: {}, facts: [] };
          if (cloudMem.entities.names) Object.keys(cloudMem.entities.names).forEach(function (k) { memory.entities.names[k] = Math.max(memory.entities.names[k] || 0, cloudMem.entities.names[k] || 0); });
          if (cloudMem.entities.facts) cloudMem.entities.facts.forEach(function (f) { if (memory.entities.facts.indexOf(f) === -1 && memory.entities.facts.length < 15) memory.entities.facts.push(f); });
        }
        if (cloudMem.topics) Object.keys(cloudMem.topics).forEach(function (k) { memory.topics[k] = Math.max(memory.topics[k] || 0, cloudMem.topics[k] || 0); });
        saveMemory();
      }
      saveSettings();
      applyTheme(settings.theme);
      applyFont();
      populateQuickModel();
      renderUsage();
    },
    /** @param {{ date: string, requests: number }} u - Usage data from cloud */
    applyCloudUsage: function (u) {
      if (u && u.requests) {
        try { localStorage.setItem(USAGE_KEY, JSON.stringify({ date: u.date, requests: u.requests })); } catch (e) {}
        renderUsage();
      }
    },
    /** @param {string} msg - Status message text */
    setStatus: setStatus,
    /** @param {string} title - Dialog title @param {string} msg - Dialog message @param {string} okLabel - OK button label @param {Function} cb - Callback on confirm */
    confirm: openConfirm,
    /** @returns {boolean} Whether a file is currently attached */
    hasAttachment: function () { return !!attachedFile; },
    /** @returns {{ name: string, text: string }|null} Current attached file info */
    getAttachment: function () { return attachedFile ? { name: attachedFile.name, text: attachedFile.text } : null; },
    refreshChip: function () {
      var btn = $('btn-save-kb');
      if (!btn) return;
      var show = !!(attachedFile && window.__kb && window.__kb.canEmbed && window.__kb.canEmbed());
      btn.hidden = !show;
    }
  };

  /** Centralized state accessor for external modules (lib/render.js, lib/search.js, etc.)
   *  Arrays/objects are live references. Primitives use getter/setter. */
  var S = window.CC.state = {};
  Object.defineProperties(S, {
    history:     { get: function () { return history; },     enumerable: true },
    sessions:    { get: function () { return sessions; },    enumerable: true },
    settings:    { get: function () { return settings; },    enumerable: true },
    summary:     { get: function () { return summary; },     enumerable: true },
    memory:      { get: function () { return memory; },      enumerable: true },
    pinned:      { get: function () { return pinned; },      enumerable: true },
    suggestions: { get: function () { return suggestions; }, enumerable: true },
    els:         { get: function () { return els; },         enumerable: true },
    busy:        { get: function () { return busy; },        set: function (v) { busy = v; },        enumerable: true },
    abortCtrl:   { get: function () { return abortCtrl; },   set: function (v) { abortCtrl = v; },   enumerable: true },
    lastUsedModel: { get: function () { return lastUsedModel; }, set: function (v) { lastUsedModel = v; }, enumerable: true },
    editingIndex: { get: function () { return editingIndex; }, set: function (v) { editingIndex = v; }, enumerable: true },
    _renderedCount: { get: function () { return _renderedCount; }, set: function (v) { _renderedCount = v; }, enumerable: true },
    searchMatches: { get: function () { return searchMatches; }, set: function (v) { searchMatches = v; }, enumerable: true },
    searchIdx:   { get: function () { return searchIdx; },   set: function (v) { searchIdx = v; },   enumerable: true },
    searchActive:{ get: function () { return searchActive; },set: function (v) { searchActive = v; },enumerable: true },
    autoScrollPaused: { get: function () { return autoScrollPaused; }, set: function (v) { autoScrollPaused = v; }, enumerable: true },
    attachedFile:{ get: function () { return attachedFile; },set: function (v) { attachedFile = v; },enumerable: true },
    attachedImage: { get: function () { return attachedImage; }, set: function (v) { attachedImage = v; }, enumerable: true },
    summarizing: { get: function () { return summarizing; }, set: function (v) { summarizing = v; }, enumerable: true },
    kbCancel:    { get: function () { return kbCancel; },    set: function (v) { kbCancel = v; },    enumerable: true },
    webMode:     { get: function () { return webMode; },     set: function (v) { webMode = v; },     enumerable: true },
    webFetching: { get: function () { return webFetching; }, set: function (v) { webFetching = v; }, enumerable: true },
    speakEnabled:{ get: function () { return speakEnabled; },set: function (v) { speakEnabled = v; },enumerable: true },
    suggestEnabled:{ get: function () { return suggestEnabled; }, set: function (v) { suggestEnabled = v; }, enumerable: true },
    translateEnabled: { get: function () { return translateEnabled; }, set: function (v) { translateEnabled = v; }, enumerable: true },
    currentSessionId: { get: function () { return currentSessionId; }, set: function (v) { currentSessionId = v; }, enumerable: true },
    cloudNotify: { get: function () { return cloudNotify; }, set: function (v) { cloudNotify = v; }, enumerable: true },
    modalStack:  { get: function () { return modalStack; }, enumerable: true },
    confirmCb:   { get: function () { return confirmCb; },   set: function (v) { confirmCb = v; },   enumerable: true },
    renameSessionId: { get: function () { return renameSessionId; }, set: function (v) { renameSessionId = v; }, enumerable: true }
  });
  window.CC.skills = {
    catalog: function () { return JSON.parse(JSON.stringify(SKILLS)); },
    bundles: function () { return JSON.parse(JSON.stringify(BUNDLES)); },
    recommend: function (text) { return bundleRecommend(text); },
    suggest: function (text, symbol) { return bundleSuggest(text, symbol); }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
