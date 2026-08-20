/* cangcilung — lapisan sinkronisasi cloud (Supabase).
   Dimuat SETELAH app.js. Tanpa konfigurasi (/api/config kosong) fitur nonaktif otomatis
   dan seluruh aplikasi berjalan lokal seperti sebelumnya. */
(function () {
  'use strict';

  var CFG_URL = '/api/config';
  var SYNC_KEY = 'cangcilung_sync';

  var state = {
    enabled: false,
    client: null,
    user: null,
    ready: false,
    syncing: false,
    suppress: false,
    inited: false,
    dirty: { sessions: false, settings: false, usage: false },
    pendingDeletes: [],
    timer: null
  };

  function log() { if (window.__cloudDebug) console.log('[cloud]', [].slice.call(arguments)); }
  function $(id) { return document.getElementById(id); }

  function stamp() {
    try { return JSON.parse(localStorage.getItem(SYNC_KEY) || '{}'); } catch (e) { return {}; }
  }
  function setStamp(s) {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  var readyListeners = [];
  function fireReady() {
    readyListeners.forEach(function (fn) { try { fn(state.client, state.user); } catch (e) { log(e); } });
    readyListeners = [];
  }
  window.__onCloudReady = function (fn) {
    if (state.enabled && state.ready && state.user && state.client) { try { fn(state.client, state.user); } catch (e) {} }
    else readyListeners.push(fn);
  };

  function app() { return window.cangcilung || null; }

  function setInd(mode, title) {
    var el = $('cloud-ind');
    if (!el) return;
    if (mode === 'off') { el.hidden = true; return; }
    el.hidden = false;
    el.dataset.state = mode;
    el.textContent = mode === 'sync' ? '⏳' : mode === 'err' ? '⚠️' : '☁️';
    el.title = title || (mode === 'sync' ? 'Menyinkronkan...' : mode === 'ok' ? 'Cloud tersinkron' : 'Sinkronisasi bermasalah');
  }

  function markDirty(kind) {
    state.dirty[kind] = true;
    clearTimeout(state.timer);
    state.timer = setTimeout(pushAll, 1200);
  }

  function notify(kind, payload) {
    if (!state.enabled || !state.ready || !state.user || state.suppress || state.syncing) return;
    if (kind === 'deleteSession') { state.pendingDeletes.push(payload); markDirty('sessions'); return; }
    markDirty(kind);
  }

  /* ---------- sanitasi: jangan pernah mengirim apiKey ke cloud ---------- */
  function cloudSettings(s) {
    var c = {};
    ['baseUrl', 'model', 'analyModel', 'persona', 'verifyEnabled', 'theme', 'voice', 'fontSize', 'soundEnabled', 'embedBaseUrl', 'embedModel']
      .forEach(function (k) { if (s[k] !== undefined) c[k] = s[k]; });
    return c;
  }

  /* ---------- push ---------- */
  function pushAll() {
    if (!state.enabled || !state.ready || !state.user || state.syncing || state.suppress) return;
    state.syncing = true;
    setInd('sync');
    var a = app();
    var jobs = [];
    if (state.dirty.sessions && a) {
      var rows = a.getSessions().map(function (s) {
        return {
          user_id: state.user.id,
          id: s.id,
          name: s.name || '',
          data: { history: s.history || [], summary: s.summary || '', pinned: s.pinned || [] },
          updated_at: new Date(s.updatedAt || Date.now()).toISOString()
        };
      });
      jobs.push(state.client.from('sessions').upsert(rows, { onConflict: 'user_id,id' })
        .then(function (r) { if (r.error) throw r.error; }));
      if (state.pendingDeletes.length) {
        var deletes = state.pendingDeletes.slice();
        state.pendingDeletes = [];
        deletes.forEach(function (id) {
          jobs.push(state.client.from('sessions').delete()
            .eq('user_id', state.user.id).eq('id', id)
            .then(function (r) { if (r.error) throw r.error; }));
        });
      }
    }
    if (state.dirty.settings && a) {
      jobs.push(state.client.from('settings').upsert({
        user_id: state.user.id,
        settings: cloudSettings(a.getSettings()),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' }).then(function (r) { if (r.error) throw r.error; }));
    }
    if (state.dirty.usage && a) {
      var u = a.getUsage();
      jobs.push(state.client.from('usage').upsert({
        user_id: state.user.id,
        date: u.date,
        requests: u.requests
      }, { onConflict: 'user_id,date' }).then(function (r) { if (r.error) throw r.error; }));
    }
    Promise.all(jobs)
      .then(function () {
        state.dirty = { sessions: false, settings: false, usage: false };
        setInd('ok');
        var s = stamp(); s.lastPushAt = Date.now(); setStamp(s);
      })
      .catch(function (e) { log('push gagal', e); setInd('err', 'Sinkronisasi gagal'); })
      .finally(function () {
        state.syncing = false;
        if (state.dirty.sessions || state.dirty.settings || state.dirty.usage || state.pendingDeletes.length) {
          clearTimeout(state.timer);
          state.timer = setTimeout(pushAll, 400);
        }
      });
  }

  /* ---------- pull + gabungkan ---------- */
  function mergeCloud(cloudRows, withSettings, withUsage) {
    var a = app();
    if (!a) return;
    state.suppress = true;
    try {
      var local = a.getSessions();
      var map = {};
      local.forEach(function (s) { map[s.id] = s; });
      var cloudIds = {};
      var changed = false;

      cloudRows.forEach(function (r) {
        cloudIds[r.id] = true;
        var t = new Date(r.updated_at).getTime();
        var ls = map[r.id];
        if (ls) {
          var lt = ls.updatedAt || 0;
          if (t > lt) {
            ls.name = r.name || ls.name;
            ls.history = (r.data && r.data.history) || [];
            ls.summary = (r.data && r.data.summary) || '';
            ls.pinned = (r.data && r.data.pinned) || [];
            ls.updatedAt = t;
            changed = true;
          } else if (lt > t) {
            state.dirty.sessions = true;
          }
        } else {
          local.push({
            id: r.id,
            name: r.name || 'Percakapan',
            history: (r.data && r.data.history) || [],
            summary: (r.data && r.data.summary) || '',
            pinned: (r.data && r.data.pinned) || [],
            updatedAt: t
          });
          changed = true;
        }
      });

      local.forEach(function (s) { if (!cloudIds[s.id]) state.dirty.sessions = true; });
      if (changed) a.applyCloudSessions(local);

      if (withSettings) {
        var cSet = cloudRows.__settings;
        var localS = a.getSettings();
        if (cSet && cSet.settings) {
          var merged = Object.assign({}, cSet.settings, { apiKey: localS.apiKey });
          a.applyCloudSettings(merged);
        } else {
          state.dirty.settings = true;
        }
      }
      if (withUsage) {
        var cUse = cloudRows.__usage;
        if (cUse && cUse.requests) {
          var lu = a.getUsage();
          if (cUse.requests > lu.requests) a.applyCloudUsage({ date: cUse.date, requests: cUse.requests });
          else state.dirty.usage = true;
        } else {
          state.dirty.usage = true;
        }
      }

      if (state.dirty.sessions || state.dirty.settings || state.dirty.usage) {
        clearTimeout(state.timer);
        state.timer = setTimeout(pushAll, 300);
      } else {
        setInd('ok');
      }
    } finally {
      state.suppress = false;
    }
  }

  function pullAll() {
    if (!state.enabled || !state.ready || !state.user || state.syncing) return;
    state.syncing = true;
    setInd('sync');
    var uid = state.user.id;
    Promise.all([
      state.client.from('sessions').select('id,name,data,updated_at').then(function (r) { if (r.error) throw r.error; return r.data; }),
      state.client.from('settings').select('settings,updated_at').maybeSingle().then(function (r) { if (r.error) throw r.error; return r.data; }),
      state.client.from('usage').select('date,requests').gte('date', todayStr()).order('date', { ascending: false }).limit(1).then(function (r) { if (r.error) throw r.error; return r.data && r.data[0]; })
    ]).then(function (res) {
      var rows = res[0] || [];
      rows.__settings = res[1];
      rows.__usage = res[2];
      mergeCloud(rows, true, true);
    }).catch(function (e) {
      log('pull gagal', e);
      setInd('err', 'Gagal memuat data cloud');
    }).finally(function () { state.syncing = false; });
  }

  function pullSessionsOnly() {
    if (!state.enabled || !state.ready || !state.user || state.syncing) return;
    state.client.from('sessions').select('id,name,data,updated_at').then(function (r) {
      if (r.error) return;
      mergeCloud(r.data || [], false, false);
    }).catch(function () {});
  }

  /* ---------- realtime ---------- */
  function subscribeRealtime() {
    try {
      if (state.channel) { state.client.removeChannel(state.channel); state.channel = null; }
      var ch = state.client.channel('sessions-' + state.user.id);
      ch.on('postgres_changes', {
        event: '*', schema: 'public', table: 'sessions', filter: 'user_id=eq.' + state.user.id
      }, function () {
        if (state.suppress || state.syncing) return;
        clearTimeout(state.timer);
        state.timer = setTimeout(pullSessionsOnly, 800);
      });
      ch.subscribe();
      state.channel = ch;
    } catch (e) { log('realtime gagal', e); }
  }

  /* ---------- auth ---------- */
  function onAuthChange(event, session) {
    state.user = session && session.user ? session.user : null;
    log('auth', event, state.user && state.user.id);
    var sc = document.getElementById('sidebar-cloud');
    if (state.user) {
      state.ready = true;
      if (sc) sc.hidden = false;
      setInd('sync', 'Menyinkronkan...');
      pullAll();
      subscribeRealtime();
      fireReady();
    } else {
      state.ready = false;
      if (sc) sc.hidden = true;
      setInd('err', 'Tidak terautentikasi');
    }
  }

  function signInAnon() {
    return state.client.auth.signInAnonymously()
      .then(function (r) { if (r.error) throw r.error; })
      .catch(function (e) {
        log('signInAnon gagal', e);
        setInd('err', 'Anonymous sign-in belum diaktifkan di dashboard Supabase');
      });
  }

  function linkEmail(email) {
    if (!state.user) return Promise.resolve('Belum terautentikasi.');
    return state.client.auth.updateUser({ email: email })
      .then(function (r) {
        if (r.error) throw r.error;
        return 'Link konfirmasi dikirim ke ' + email + '. Setelah dikonfirmasi, akun ini terhubung ke email dan bisa dipakai di perangkat lain.';
      })
      .catch(function (e) { return 'Gagal menghubungkan: ' + (e.message || e); });
  }

  function signOut() {
    return state.client.auth.signOut()
      .then(function () { state.ready = false; return 'Keluar dari cloud. Data tetap aman di perangkat ini.'; })
      .catch(function (e) { return 'Gagal keluar: ' + (e.message || e); });
  }

  /* ---------- UI modal cloud ---------- */
  function openCloudModal() {
    var a = app();
    if (!a || !$('cloud-modal')) return;
    var msg = $('cloud-msg'), emailWrap = $('cloud-email-wrap'), emailNote = $('cloud-email-note'), linkBtn = $('btn-cloud-link'), outBtn = $('btn-cloud-out');
    if (!state.enabled) {
      if (msg) msg.textContent = 'Sinkronisasi cloud belum aktif di lingkungan ini.';
      if (emailWrap) emailWrap.hidden = true;
      if (emailNote) emailNote.hidden = true;
      if (linkBtn) linkBtn.hidden = true;
      if (outBtn) outBtn.hidden = true;
    } else if (!state.user) {
      if (msg) msg.textContent = 'Menunggu autentikasi...';
      if (emailWrap) emailWrap.hidden = true;
      if (emailNote) emailNote.hidden = true;
      if (linkBtn) linkBtn.hidden = true;
      if (outBtn) outBtn.hidden = true;
    } else {
      var anon = !!state.user.is_anonymous;
      if (msg) msg.textContent = anon
        ? 'Tersambung sebagai pengguna anonim. Riwayat disinkronkan otomatis. Hubungkan email untuk memakai di perangkat lain.'
        : 'Tersambung dengan akun: ' + (state.user.email || state.user.id);
      if (emailWrap) emailWrap.hidden = !anon;
      if (emailNote) emailNote.hidden = !anon;
      if (linkBtn) linkBtn.hidden = !anon;
      if (outBtn) outBtn.hidden = false;
    }
    a.openModal('cloud-modal');
    var emailBox = $('cloud-email');
    if (emailBox && !emailBox.hidden) emailBox.focus();
  }

  /* ---------- init ---------- */
  window.__cloudInit = function () {
    if (state.inited) return;
    state.inited = true;
    fetch(CFG_URL, { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('config ' + r.status); return r.json(); })
      .then(function (cfg) {
        if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
          log('cloud nonaktif (tanpa konfigurasi)');
          setInd('off');
          return;
        }
        if (!window.supabase) { log('library supabase tidak dimuat'); setInd('off'); return; }
        state.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        state.enabled = true;
        state.client.auth.onAuthStateChange(function (ev, session) { onAuthChange(ev, session); });
        signInAnon();
      })
      .catch(function (e) { log('config gagal', e); setInd('off'); });
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (window.__setCloudHook) window.__setCloudHook(notify);
    var ind = $('cloud-ind');
    if (ind) ind.addEventListener('click', openCloudModal);
    var closes = document.querySelectorAll('[data-cloud-close]');
    Array.prototype.forEach.call(closes, function (b) {
      b.addEventListener('click', function () { var a = app(); if (a) a.closeModal('cloud-modal'); });
    });
    var linkBtn = $('btn-cloud-link');
    if (linkBtn) linkBtn.addEventListener('click', function () {
      var email = ($('cloud-email').value || '').trim();
      if (!email) { $('cloud-msg').textContent = 'Masukkan alamat email.'; return; }
      linkBtn.disabled = true;
      linkEmail(email).then(function (m) {
        $('cloud-msg').textContent = m;
        linkBtn.disabled = false;
      });
    });
    var outBtn = $('btn-cloud-out');
    if (outBtn) outBtn.addEventListener('click', function () {
      outBtn.disabled = true;
      signOut().then(function (m) {
        $('cloud-msg').textContent = m;
        outBtn.disabled = false;
      });
    });
    window.__cloudInit();
  });
})();
