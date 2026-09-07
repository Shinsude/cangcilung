/* cangcilung — Konsol ML & DL signal trading
 * Konsol perintah trading: analisis teknikal (TA), machine learning/deep learning,
 * backtest, sinyal live, risk & korelasi untuk XAUUSD dan lainnya.
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
  window.__setCloudHook = function (fn) {
    cloudNotify = fn;
    if (window.CC) window.CC.onAffChange = function () { if (cloudNotify) cloudNotify('affProducts'); };
  };

  function touchSession() {
    var s = currentSession();
    if (s) s.updatedAt = Date.now();
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
      btn.innerHTML = theme === 'dark'
        ? '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
        : '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
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


  function renderPins() {
    var list = $('pins-list');
    if (!list) return;
    list.innerHTML = '';
    if (!pinned.length) {
      list.innerHTML = '<p class="set-hint">Belum ada pesan tersemat. Klik ikon pin di samping pesan untuk menyemat.</p>';
      return;
    }
    pinned.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'pin-item';
      var role = document.createElement('div');
      role.className = 'pin-role';
      role.textContent = p.role === 'user' ? 'Anda' : 'CangCilung';
      var body = document.createElement('div');
      body.className = 'pin-body';
      body.textContent = p.content.slice(0, 500);
      var act = document.createElement('button');
      act.className = 'pin-act';
      act.innerHTML = actionSvg('pin') + ' Lepas';
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
    var inpE = $('rename-input');
    if (!inpE) return;
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


  function saveHistory() {
    /* Transkrip murni in-memory; tidak dipersist. */
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
    var list = (window.CC && window.CC.aff) ? window.CC.aff.getProducts() : [];
    var n = list && list.length ? list.length : 0;
    el.textContent = n ? 'Produk aktif: ' + n + ' • Analisis • Optimasi • Prediksi' : 'AI ML & DL — Analisis • Optimasi • Prediksi • Strategi';
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

  /* Ikon aksi bubble — SVG inline konsisten (bukan emoji). */
  var ACT_ICONS = {
    copy: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    edit: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
    regen: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    pin: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
  };
  function actionSvg(name) { return ACT_ICONS[name] || ''; }

  function addBubble(role, text, index, ts) {
    var box = $('chat-messages');
    var el = document.createElement('div');
    if (role === 'user') {
      el.className = 'c-in';
      if (text != null) el.textContent = text;
    } else {
      el.className = 'c-out';
      if (text != null) renderMarkdown(el, text || '…');
    }
    box.hidden = false;
    box.appendChild(el);
    scrollChat();
    return el;
  }

  var editingIndex = -1;






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



/* Layar utama = Live Signal XAUUSD (panel penuh, auto-refresh 45 dtk).
   Dipasang permanen; perintah menambah baris ke transkrip di bawahnya. */
  var _dashTimer = null;
  function renderLiveMain() {
    var body = $('live-main-body');
    if (!body) return;
    var zoom = $('live-open-modal');
    if (zoom && !zoom._affWired) {
      zoom._affWired = true;
      zoom.addEventListener('click', function () { handleAffAnalisis(); });
    }
    renderAffDashboard();
    if (_dashTimer) clearInterval(_dashTimer);
    _dashTimer = setInterval(renderAffDashboard, 60000);
  }

  /* Dashboard affiliator: ringkasan laba + rekomendasi cepat dari CC.aff. */
  function renderAffDashboard() {
    var body = $('live-main-body');
    if (!body) return;
    var html;
    if (!window.CC || !window.CC.aff) {
      html = '❌ Mesin AI affiliator `CC.aff` belum dimuat. Muat ulang halaman.';
    } else {
      var list = window.CC.aff.getProducts();
      if (!list || !list.length) {
        html = 'Belum ada data **produk**.\n\n' +
          'Tekan **Tambah Produk** (form) untuk input manual, atau jalankan `/demo` untuk 10 produk contoh.\n\n' +
          'Perintah: `/analisis` `/optimasi` `/prediksi` `/forecast` `/strategi` `/daftar` — ketik `/help` untuk bantuan.';
      } else {
        var a = window.CC.aff.analyze(list);
        var o = window.CC.aff.optimize(list);
        var lines = ['## Dashboard Affiliator', ''];
        lines.push('- **Produk**: ' + a.n + ' buah');
        lines.push('- **Pendapatan**: ' + affRupiah(a.totalPendapatan) + ' · biaya ' + affRupiah(a.totalBiaya));
        lines.push('- **Laba bersih**: **' + affRupiah(a.laba) + '** (_' + affPct(a.margin) + ' margin_)');
        lines.push('- **Konversi**: ' + affNum(a.totalKlik) + ' klik → ' + affNum(a.totalKonversi) + ' (' + affPct(a.convRate) + ')');
        lines.push('- **Niche terbaik**: ' + (a.bestNiche ? a.bestNiche.key : '—') + ' · **Platform terbaik**: ' + (a.bestPlatform ? a.bestPlatform.key : '—'));
        lines.push('- **Menguntungkan**: ' + a.profitableCount + '/' + a.n);
        lines.push('');
        if (o.genjot && o.genjot.length) {
          lines.push('### 🚀 Genjot produk');
          o.genjot.forEach(function (n, i) { lines.push((i + 1) + '. `' + n + '`'); });
          lines.push('');
        }
        lines.push('Perintah: `/analisis` `/optimasi` `/prediksi` `/forecast` `/strategi`');
        html = lines.join('\n');
      }
    }
    body.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'c-out';
    renderMarkdown(wrap, html);
    body.appendChild(wrap);
  }

function renderHistory(forceFull) {
    var box = $('chat-messages');
    if (!box) return;
    if (!history.length) {
      box.innerHTML = '';
      box.hidden = true;
      _renderedCount = 0;
      return;
    }
    if (!forceFull && _renderedCount >= history.length) return;
    box.hidden = false;
    box.innerHTML = '';
    _renderedCount = 0;
    for (var i = 0; i < history.length; i++) {
      var m = history[i];
      if (m.role === 'user') {
        var c = document.createElement('div');
        c.className = 'c-in';
        c.textContent = m.content;
        box.appendChild(c);
      } else {
        var o = document.createElement('div');
        o.className = 'c-out';
        renderMarkdown(o, m.content || '…');
        addRunButtons(o);
        box.appendChild(o);
      }
      _renderedCount++;
    }
    scrollChat();
  }

  var searchMatches = [];
  var searchIdx = 0;
  var searchActive = false;








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
      btn.title = 'Hentikan proses';
      btn.disabled = false;
    } else {
      btn.textContent = '>';
      btn.title = 'Jalankan perintah';
      btn.disabled = false;
    }
  }

  function abortAll() {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = null;
    busy = false;
    setSendUI(false);
    setStatus('');
    clearProgress();
  }

  /* Progress bar operasi panjang (training ML dkk). */
  function clearProgress() {
    var row = $('prog-row'), fill = $('prog-fill');
    if (row) row.hidden = true;
    if (fill) fill.style.width = '0%';
  }





  /* Fokus trading: Cangcilung berdiri untuk XAUUSD (emas) saja.
     Semua perintah analisis trading dialihkan ke XAUUSD bila simbol lain diminta. */



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













  /* Panel menu Signal: pantau live signal utk XAUUSD via antarmuka (tanpa ketik).
     Auto-mulai segera saat dibuka — tidak perlu klik apa pun. Dropdown strategi
     mengganti indikator yang dipantau secara otomatis. */

  /* Pastikan ada signal XAUUSD untuk strategi pilihan; jika strategi lain sedang
     aktif, ganti ke strategi baru (satu signal XAUUSD per menu). */


  // minta izin notifikasi sistem sekali (dipicu saat live signal diaktifkan/tombol panel)





  /* ---------- Machine Learning & Deep Learning (/ml & /ml-signal) ---------- */
  // Parsing opsi: engine:vanilla|tfjs, horizon:N, epochs:N, tf:on
  function finalizeMessage(out) {
    history.push({ role: 'assistant', content: out, t: nowTime() });
    renderHistory();
    busy = false; setSendUI(false); setStatus(''); clearProgress();
  }
  // /ml SYM — latih model arah (Model A) + laporan validasi.
  // Vanilla: training di-chunk (UI tidak beku), deterministik (seed 42) & hasil disimpan di
  // localStorage -> pemanggilan berikutnya langsung dari cache (instan, tanpa training ulang).
  // /ml-signal SYM STRAT — prediksi arah (Model A) + skor sinyal TA (Model B, pakai hasil Model A)

  /* ---- Skills & Bundles (pola MANTRA: katalog + bundel terurut) ----
     Data + rekomendasi murni diekstrak ke lib/mantra.js. */
  var MANTRA = window.cangcilungMantra || {};
  var SKILLS = MANTRA.SKILLS || {};
  var BUNDLES = MANTRA.BUNDLES || {};
  function executeSkill(handler, args) {
    args = args || [];
    switch (handler) {
      case 'tambah': return addProductFromCommand(args.join(' '));
      case 'list': return handleAffList();
      case 'hapus': return handleAffHapus(args[0] || '');
      case 'beres': return handleAffClear();
      case 'demo': return handleAffDemo();
      case 'analisis': return handleAffAnalisis();
      case 'optimasi': return handleAffOptimasi();
      case 'prediksi': return handleAffPrediksi(args[0] || '');
      case 'forecast': return handleAffForecast(args[0] || '');
      case 'strategi': return handleAffStrategi();
      case 'session': return handleSessionCommand();
      default: return false;
    }
  }
  function bundleRecommend(text) {
    return MANTRA.bundleRecommend ? MANTRA.bundleRecommend(text, SKILLS, BUNDLES) : null;
  }
  function bundleSuggest(text, symbol) {
    var bn = bundleRecommend(text || '');
    if (!bn) return '';
    return renderBundle(bn, (symbol || 'XAUUSD').toUpperCase(), bn === 'analisa' ? 'analisis' : null);
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
    var bundleName = arg[0] && BUNDLES[arg[0].toLowerCase()] ? arg[0].toLowerCase() : null;
    var skillName = null;
    if (!bundleName && arg[0] && SKILLS[arg[0].toLowerCase()]) skillName = arg[0].toLowerCase();
    if (bundleName) {
      var trigger = bundleName === 'analisa' ? 'analisis' : bundleName;
      if (executeSkill(trigger, arg.slice(1)) !== false) return;
    }
    if (skillName) {
      if (executeSkill(skillName, arg.slice(1)) !== false) return;
    }
    var out = '## 🧩 Katalog Skill & Bundel\n\n### Perintah (skill)\n';
    Object.keys(SKILLS).forEach(function (n) { out += '- `/skills ' + n + '` → `' + SKILLS[n].cmd + '` — ' + SKILLS[n].desc + '\n'; });
    out += '\n### Bundel (alur terurut)\n';
    Object.keys(BUNDLES).forEach(function (n) { out += '- `/skills ' + n + '` — ' + BUNDLES[n].desc + '\n'; });
    out += '\nContoh: `/skills analisa` (ringkasan → optimasi → prediksi). Ketik `/help` untuk daftar lengkap.';
    pushMessage(out);
  }
  function handleHelpCommand() {
    var out = '## Perintah CangCilung Affiliate 🤖\n\n';
    out += '> 🎯 Konsol **AI ML & Deep Learning** untuk affiliator penjualan: analisis data produk, optimasi konten & strategi, prediksi konversi/pendapatan. Data tersimpan lokal (PWA) dan siap sinkron cloud.\n';
    out += '### Data produk\n';
    out += '- `/tambah` — buka form tambah produk (`/tambah nama=.. harga=.. komisi=.. klik=.. konversi=.. pendapatan=.. biaya=.. niche=.. konten=.. platform=..`)\n';
    out += '- `/daftar` — tabel semua produk & laba\n';
    out += '- `/hapus <nama/id>` — hapus satu produk · `/beres` — bersihkan semua\n';
    out += '- `/demo` — muat 10 produk contoh (belajar)\n';
    out += '### Analisis & Optimasi\n';
    out += '- `/analisis` — pendapatan, biaya, laba, margin, konversi + terbaik per niche/platform/konten\n';
    out += '- `/optimasi` — produk **DIGENJOT** vs **DIEVALUASI** + saran konkret\n';
    out += '### Prediksi & Strategi\n';
    out += '- `/prediksi` — latih neural network di browser (seed 42) → skor p(untung) tiap produk + validasi OOS\n';
    out += '  · opsional `epochs:N` `engine:vanilla|tfjs` — hasil disimpan & dipanggil ulang instan\n';
    out += '- `/forecast` — proyeksi pendapatan periode berikutnya (default `bulanan`, opsional `harian`/`tahunan`)\n';
    out += '- `/strategi` — langkah konkret menaikkan komisi\n';
    out += '### Lainnya\n';
    out += '- `/skills` — katalog skill & bundel · `/session` — kelola sesi\n';
    out += '- Teks bebas juga diterima, misal: *"produk mana yang harus di-genjot?"*\n\n';
    out += '💡 Pastikan angka realistic: `pendapatan` = nilai penjualan yang tercatat, `biaya` = modal/iklan/ongkos produk.';
    pushMessage(out);
  }







  /* ═══════════════ AFFILIATE: input data, dashboard, & perintah konsol ═══════════════ */

  function affRupiah(v) {
    return 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
  }
  function affPct(v) {
    return ((Number(v) || 0) * 100).toFixed(1) + '%';
  }
  function affNum(v) {
    return Math.round(Number(v) || 0).toLocaleString('id-ID');
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseAffArgs(text) {
    var out = {};
    String(text || '').split(/\s+/).forEach(function (t) {
      var m = t.match(/^([a-zA-Z]+)=(.+)$/);
      if (m) out[m[1].toLowerCase()] = m[2];
    });
    return out;
  }

  function setProductStatus(msg, isError) {
    var el = $('product-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'set-status' + (isError ? ' error' : '');
  }
  function productById(id) {
    if (!window.CC || !window.CC.aff) return null;
    var list = window.CC.aff.getProducts();
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
    return null;
  }
  function readProductForm() {
    return {
      nama: ($('pf-nama').value || '').trim(),
      niche: $('pf-niche').value || 'Umum',
      harga: parseFloat($('pf-harga').value) || 0,
      komisiPct: parseFloat($('pf-komisi').value) || 0,
      klik: parseInt($('pf-klik').value, 10) || 0,
      konversi: parseInt($('pf-konversi').value, 10) || 0,
      pendapatan: parseFloat($('pf-pendapatan').value) || 0,
      biaya: parseFloat($('pf-biaya').value) || 0,
      konten: $('pf-konten').value || 'Review',
      platform: $('pf-platform').value || 'TikTok',
      tanggal: $('pf-tanggal').value || todayStr()
    };
  }
  function setProductForm(id, rec) {
    $('pf-id').value = id || '';
    $('pf-nama').value = rec && rec.nama ? rec.nama : '';
    $('pf-niche').value = rec && rec.niche ? rec.niche : 'Umum';
    $('pf-harga').value = rec && rec.harga ? rec.harga : '';
    $('pf-komisi').value = rec && rec.komisiPct ? rec.komisiPct : '';
    $('pf-klik').value = rec && rec.klik ? rec.klik : '';
    $('pf-konversi').value = rec && rec.konversi ? rec.konversi : '';
    $('pf-pendapatan').value = rec && rec.pendapatan ? rec.pendapatan : '';
    $('pf-biaya').value = rec && rec.biaya ? rec.biaya : '';
    $('pf-konten').value = rec && rec.konten ? rec.konten : 'Review';
    $('pf-platform').value = rec && rec.platform ? rec.platform : 'TikTok';
    $('pf-tanggal').value = rec && rec.tanggal ? rec.tanggal : todayStr();
  }
  function openProductForm(id) {
    var modal = $('product-modal');
    if (!modal) return;
    if (id) {
      var rec = productById(id);
      if (!rec) { setProductStatus('Produk tidak ditemukan.', true); return; }
      $('product-modal-title').textContent = 'Edit Produk';
      setProductForm(id, rec);
    } else {
      $('product-modal-title').textContent = 'Tambah Produk';
      setProductForm(null, null);
    }
    setProductStatus('');
    openModal('product-modal');
  }
  function closeProductForm() {
    closeModal('product-modal');
  }
  function saveProductFromForm() {
    if (!window.CC || !window.CC.aff) { setProductStatus('Mesin AI belum dimuat.', true); return; }
    var data = readProductForm();
    if (!data.nama) { setProductStatus('Nama produk wajib diisi.', true); return; }
    var id = $('pf-id').value;
    var res = id ? window.CC.aff.updateProduct(id, data) : window.CC.aff.addProduct(data);
    if (res && res.error) { setProductStatus(res.error, true); return; }
    closeProductForm();
    renderAffDashboard();
    connSub();
    showToast(id ? 'Produk diperbarui.' : 'Produk ditambahkan.');
  }
  function demoProductsFromForm() {
    if (!window.CC || !window.CC.aff) return;
    window.CC.aff.seedDemo();
    closeProductForm();
    renderAffDashboard();
    connSub();
    showToast('Contoh data dimuat (10 produk).');
  }
  function addProductFromCommand(rest) {
    if (!window.CC || !window.CC.aff) { setStatus('Mesin AI belum dimuat.', true); return; }
    var kv = parseAffArgs(rest);
    var nama = (kv.nama || '').replace(/_/g, ' ').trim();
    if (!nama) { openProductForm(); return; }
    var rec = {
      nama: nama,
      niche: kv.niche || 'Umum',
      harga: parseFloat(String(kv.harga || '0').replace(/,/g, '')) || 0,
      komisiPct: parseFloat(String(kv.komisi || '0').replace(/,/g, '')) || 0,
      klik: parseInt(kv.klik, 10) || 0,
      konversi: parseInt(kv.konversi, 10) || 0,
      pendapatan: parseFloat(String(kv.pendapatan || '0').replace(/,/g, '')) || 0,
      biaya: parseFloat(String(kv.biaya || '0').replace(/,/g, '')) || 0,
      konten: kv.konten || 'Review',
      platform: kv.platform || 'TikTok',
      tanggal: kv.tanggal || todayStr()
    };
    var res = window.CC.aff.addProduct(rec);
    if (res && res.error) { setStatus(res.error, true); return; }
    renderAffDashboard();
    connSub();
    finalizeMessage('✅ Produk **' + rec.nama + '** ditambahkan (total ' + res.count + ').\n\n`/daftar` untuk melihat semua, `/analisis` untuk ringkasan.');
  }

  function handleAffList() {
    if (!window.CC || !window.CC.aff) { setStatus('Mesin AI belum dimuat.', true); return; }
    finalizeMessage(window.CC.aff.formatProducts(window.CC.aff.getProducts()));
  }
  function handleAffAnalisis() {
    if (!window.CC || !window.CC.aff) { setStatus('Mesin AI belum dimuat.', true); return; }
    var a = window.CC.aff.analyze(window.CC.aff.getProducts());
    finalizeMessage(window.CC.aff.formatAnalysis(a));
  }
  function handleAffOptimasi() {
    if (!window.CC || !window.CC.aff) { setStatus('Mesin AI belum dimuat.', true); return; }
    var o = window.CC.aff.optimize(window.CC.aff.getProducts());
    finalizeMessage(window.CC.aff.formatOptimize(o));
  }
  function handleAffStrategi() {
    if (!window.CC || !window.CC.aff) { setStatus('Mesin AI belum dimuat.', true); return; }
    var s = window.CC.aff.strategy(window.CC.aff.getProducts());
    finalizeMessage(window.CC.aff.formatStrategy(s));
  }
  function handleAffDemo() {
    if (!window.CC || !window.CC.aff) { setStatus('Mesin AI belum dimuat.', true); return; }
    window.CC.aff.seedDemo();
    renderAffDashboard();
    connSub();
    finalizeMessage('🎲 **10 produk contoh** dimuat.\n\nCoba: `/analisis`, `/optimasi`, `/prediksi`, `/forecast`.');
  }
  function handleAffHapus(q) {
    if (!window.CC || !window.CC.aff) { setStatus('Mesin AI belum dimuat.', true); return; }
    if (!q) { finalizeMessage('Gunakan: `/hapus <nama>` atau `/hapus #<id>`.'); return; }
    var target = null;
    if (/^#/.test(q)) target = productById(q.slice(1));
    if (!target) {
      var pat = String(q).toLowerCase();
      window.CC.aff.getProducts().forEach(function (p) {
        if (!target && String(p.nama).toLowerCase().indexOf(pat) > -1) target = p;
      });
    }
    if (!target) { finalizeMessage('⚠️ Produk tidak ditemukan: `' + q + '`. Ketik `/daftar` untuk melihat daftar.'); return; }
    var res = window.CC.aff.deleteProduct(target.id);
    if (res && res.error) { setStatus(res.error, true); return; }
    renderAffDashboard();
    connSub();
    finalizeMessage('🗑️ **' + target.nama + '** dihapus (sisa ' + res.count + ').');
  }
  function handleAffClear() {
    if (!window.CC || !window.CC.aff) { setStatus('Mesin AI belum dimuat.', true); return; }
    window.CC.aff.clearProducts();
    renderAffDashboard();
    connSub();
    finalizeMessage('🧹 Semua data produk dibersihkan. Tambahkan lewat `/tambah` atau `/demo`.');
  }
  function handleAffPrediksi(raw) {
    if (!window.CC || !window.CC.aff) { setStatus('Mesin AI belum dimuat.', true); return; }
    var kv = parseAffArgs(raw);
    var list = window.CC.aff.getProducts();
    if (!list || !list.length) { finalizeMessage('⚠️ Belum ada data. Tambahkan dulu (`/tambah` / `/demo`).'); return; }
    if (list.length < 5) { finalizeMessage('⚠️ Butuh **minimal 5 produk** untuk melatih model. Tambahkan lagi (`/tambah`).'); return; }
    busy = true; setSendUI(true);
    setStatus('Melatih model MLP… (seed 42, deterministik)');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    var opt = {};
    if (kv.epochs) opt.epochs = parseInt(kv.epochs, 10);
    if (kv.engine === 'tfjs' || kv.engine === 'vanilla') opt.engine = kv.engine;
    window.CC.aff.scoreProducts(list, opt).then(function (res) {
      removeTyping(bubble);
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      if (res.error) { finalizeMessage('⚠️ ML gagal: ' + res.error); return; }
      finalizeMessage(window.CC.aff.formatScores(res));
      renderAffDashboard();
      connSub();
    }).catch(function (e) {
      removeTyping(bubble);
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      finalizeMessage('⚠️ ML gagal: ' + (e && e.message ? e.message : e));
    });
  }
  function handleAffForecast(raw) {
    if (!window.CC || !window.CC.aff) { setStatus('Mesin AI belum dimuat.', true); return; }
    var period = 'bulanan';
    if (/harian|hari|daily/.test(String(raw))) period = 'harian';
    else if (/tahunan|tahun|yearly/.test(String(raw))) period = 'tahunan';
    var list = window.CC.aff.getProducts();
    if (!list || !list.length) { finalizeMessage('⚠️ Belum ada data bertanggal. Tambahkan produk dulu.'); return; }
    busy = true; setSendUI(true);
    setStatus('Menghitung proyeksi pendapatan…');
    var bubble = addBubble('assistant', null);
    showTyping(bubble);
    window.CC.aff.forecast(list, { period: period }).then(function (res) {
      removeTyping(bubble);
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      if (res.error) { finalizeMessage('⚠️ ' + res.error); return; }
      finalizeMessage(window.CC.aff.formatForecast(res));
    }).catch(function (e) {
      removeTyping(bubble);
      if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
      finalizeMessage('⚠️ Forecast gagal: ' + (e && e.message ? e.message : e));
    });
  }

  function addUserMessage(text) {
    history.push({ role: 'user', content: text, t: nowTime() });
    renderHistory();
  }

  function sendChat() {
    var input = $('chat-input');
    var text = (input && input.value || '').trim();
    if (/^(help|skills|session)\b/i.test(text)) {
      input.value = '';
      if (/^\/help\b/i.test(text)) { handleHelpCommand(); return; }
      if (/^\/skills\b/i.test(text)) { handleSkillsCommand(text); return; }
      if (/^\/session\b/i.test(text)) { handleSessionCommand(); return; }
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
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    if (/^\/tambah\b/i.test(text)) {
      var rest = text.replace(/^\/tambah\b\s*/i, '').trim();
      if (rest) addProductFromCommand(rest);
      else openProductForm();
      return;
    }
    if (/^\/(daftar|list|produk)\b/i.test(text)) { handleAffList(); return; }
    if (/^\/hapus\b/i.test(text)) { handleAffHapus(text.replace(/^\/hapus\b\s*/i, '').trim()); return; }
    if (/^\/beres\b/i.test(text)) { handleAffClear(); return; }
    if (/^\/demo\b/i.test(text)) { handleAffDemo(); return; }
    if (/^\/(analisis|analisa)\b/i.test(text)) { handleAffAnalisis(); return; }
    if (/^\/optimasi\b/i.test(text)) { handleAffOptimasi(); return; }
    if (/^\/(prediksi|skor)\b/i.test(text)) { handleAffPrediksi(text.replace(/^\/(prediksi|skor)\b\s*/i, '').trim()); return; }
    if (/^\/(forecast|proyeksi)\b/i.test(text)) { handleAffForecast(text.replace(/^\/(forecast|proyeksi)\b\s*/i, '').trim()); return; }
    if (/^\/strategi\b/i.test(text)) { handleAffStrategi(); return; }

    addUserMessage(text);

    var g = text.replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (g.length <= 40 && /(^|\s)(hi|halo|hallo|helo|hello|hai|oy|hey|p|oke|ok|okay|sip|mantap|makasih|terima kasih|thanks|thank you|assalamualaikum|pagi|siang|sore|malam)(\s|$)/.test(g) && !/\//.test(text)) {
      finalizeMessage(
        'Halo! Konsol **AI ML &amp; DL affiliator** siap dipakai.\n\n' +
        'Coba: `/analisis`, `/optimasi`, `/prediksi`, `/forecast`.\n' +
        'Ketik `/help` untuk daftar perintah.'
      );
      return;
    }
    if (/produk|affiliat|afiliat|komisi|penjualan|konversi|klik|niche|strategi|genjot|laba|pendapatan|untung|optimasi|konten|platform/i.test(text) && text.length <= 100) {
      handleAffAnalisis();
      return;
    }
    finalizeMessage(
      'Perintah **tidak dikenali**: `' + text + '`\n\n' +
      'Konsol ini adalah bantuan affiliator. Contoh cepat:\n\n' +
      '- `/analisis` — ringkasan penjualan & laba\n' +
      '- `/prediksi` — skor ML profitabilitas produk\n' +
      '- `/forecast` — proyeksi pendapatan berikutnya\n' +
      '- `/strategi` — langkah menaikkan komisi\n\n' +
      'Ketik `/help` untuk daftar perintah lengkap.'
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
    if (e.key === 'Escape') {
      var im = $('input-more-menu');
      if (im && !im.hidden) { closeInputMore(); return; }
      var menu = $('tools-menu');
      if (menu && !menu.hidden) { closeToolsMenu(); return; }
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
    window.addEventListener('beforeunload', function () { if (!window.__skipSave) saveSessionsNow(); });
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
          cs.textContent = 'Offline — tanpa internet, data tidak diperbarui';
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
    renderLiveMain();
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

    var addBtn = $('btn-add-product');
    if (addBtn) addBtn.addEventListener('click', function () { openProductForm(); });

    var scrollBtn = $('btn-scroll-down');
    if (scrollBtn) scrollBtn.addEventListener('click', scrollToBottom);
    var messages = $('chat-messages');
    if (messages) messages.addEventListener('scroll', onChatScroll);

    /* ── Aksi tombol run pada blok kode output ── */
    if (messages) messages.addEventListener('click', function (e) {
      var btn = e.target.closest('.run-btn');
      if (!btn) return;
      var pre = btn.closest('pre');
      var code = pre ? pre.querySelector('code') : null;
      if (code) runCode(code.textContent, pre);
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

    /* ── Modal Produk ── */
    var pmClose = $('btn-product-close'), pmCancel = $('btn-product-cancel'), pmSave = $('btn-product-save'), pmDemo = $('btn-product-demo');
    if (pmClose) pmClose.addEventListener('click', closeProductForm);
    if (pmCancel) pmCancel.addEventListener('click', closeProductForm);
    if (pmSave) pmSave.addEventListener('click', saveProductFromForm);
    if (pmDemo) pmDemo.addEventListener('click', demoProductsFromForm);
    var pModal = $('product-modal');
    if (pModal) pModal.addEventListener('click', function (e) { if (e.target === pModal) closeProductForm(); });

    renderAffDashboard();
  }

  /** @type {Object} Public API for cloud.js, kb.js, and external consumers */
  window.cangcilung = {
    /** @returns {Array<Object>} Shallow copy of all sessions */
    getSessions: function () { return sessions.slice(); },
    /** @returns {Array<Object>} Copy of all affiliate products */
    getAffProducts: function () { return (window.CC && window.CC.aff) ? window.CC.aff.getProducts() : []; },
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
    /** @param {Array<Object>} arr - Cloud-synced affiliate products */
    applyCloudProducts: function (arr) {
      if (!Array.isArray(arr) || !window.CC || !window.CC.aff) return;
      window.CC.aff.setProducts(arr);
      window.CC.aff.saveProducts();
      renderAffDashboard();
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
