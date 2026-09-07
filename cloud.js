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
    dirty: { sessions: false, settings: false, usage: false, affProducts: false },
    pendingDeletes: [],
    timer: null,
    channel: null,
    affChannel: null
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
  function num(v, def) { var n = Number(v); return isFinite(n) ? n : (def == null ? 0 : def); }

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
    if (kind === 'affProducts') { markDirty('affProducts'); return; }
    markDirty(kind);
  }

  /* ---------- sanitasi: jangan pernah mengirim apiKey ke cloud ---------- */
  function cloudSettings(s) {
    var c = {};
    ['baseUrl', 'model', 'analyModel', 'persona', 'verifyEnabled', 'theme', 'voice', 'fontSize', 'soundEnabled', 'suggestEnabled', 'embedBaseUrl', 'embedModel']
      .forEach(function (k) { if (s[k] !== undefined) c[k] = s[k]; });
    try {
      var memRaw = localStorage.getItem('cangcilung_memory');
      if (memRaw) c.memory = JSON.parse(memRaw);
    } catch (e) {}
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
    if (state.dirty.affProducts && a && a.getAffProducts) {
      /* produk yang baru dihapus ditandai tombstone → dikirim sebagai baris
         { _deleted:true, ... } agar perangkat lain ikut menghapusnya. */
      var tombs = (a.getTombstones ? a.getTombstones() : []).map(function (t) {
        return { id: String(t.id), updatedAt: num(t.updatedAt, Date.now()) };
      });
      var tombIds = {};
      var maxTombTs = 0;
      tombs.forEach(function (t) { tombIds[t.id] = true; if (t.updatedAt > maxTombTs) maxTombTs = t.updatedAt; });
      var arows = a.getAffProducts().filter(function (p) { return !tombIds[String(p.id)]; }).map(function (p) {
        return {
          user_id: state.user.id,
          id: String(p.id),
          product: p,
          updated_at: new Date(p.updatedAt || Date.now()).toISOString()
        };
      });
      tombs.forEach(function (t) {
        arows.push({
          user_id: state.user.id,
          id: t.id,
          product: { _deleted: true, id: t.id, updatedAt: t.updatedAt },
          updated_at: new Date(t.updatedAt).toISOString()
        });
      });
      jobs.push(state.client.from('affproducts').upsert(arows, { onConflict: 'user_id,id' })
        .then(function (r) { if (r.error) throw r.error; })
        .then(function () { if (a.clearTombstones) a.clearTombstones(maxTombTs); }));
    }
    Promise.all(jobs)
      .then(function () {
        state.dirty = { sessions: false, settings: false, usage: false, affProducts: false };
        setInd('ok');
        var s = stamp(); s.lastPushAt = Date.now(); setStamp(s);
      })
      .catch(function (e) { log('push gagal', e); setInd('err', 'Sinkronisasi gagal'); })
      .finally(function () {
        state.syncing = false;
        if (state.dirty.sessions || state.dirty.settings || state.dirty.usage || state.dirty.affProducts || state.pendingDeletes.length) {
          clearTimeout(state.timer);
          state.timer = setTimeout(pushAll, 400);
        }
      });
  }

  /* ---------- pull + gabungkan ---------- */
  function mergeCloud(cloudRows, withSettings, withUsage, withAff) {
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
      if (withAff && a.getAffProducts && a.applyCloudProducts) {
        var cAff = cloudRows.__aff || [];
        var localP = a.getAffProducts();
        var pmap = {};
        localP.forEach(function (p) { pmap[String(p.id)] = p; });
        var pChanged = false;
        cAff.forEach(function (r) {
          var t = new Date(r.updated_at).getTime();
          var id = String(r.id);
          var prod = r.product || {};
          /* tombstone: hapus produk lokal (bila cloud lebih baru) — jangan
             re-add dan jangan tandai dirty (menghindari re-push yang memunculkan
             kembali produk yang sudah dihapus). */
          if (prod._deleted === true) {
            var lp = pmap[id];
            if (lp) {
              var lt = lp.updatedAt || 0;
              if (t > lt) { delete pmap[id]; pChanged = true; }
              else if (lt > t) state.dirty.affProducts = true; // lokal lebih baru → balas push
            }
            return;
          }
          if (pmap[id]) {
            var lt2 = pmap[id].updatedAt || 0;
            if (t > lt2) { pmap[id] = Object.assign({}, pmap[id], prod, { updatedAt: t }); pChanged = true; }
            else if (lt2 > t) state.dirty.affProducts = true;
          } else {
            pmap[id] = Object.assign({}, prod, { updatedAt: t });
            pChanged = true;
          }
        });
        if (pChanged) a.applyCloudProducts(Object.keys(pmap).map(function (k) { return pmap[k]; }));
      }

      if (state.dirty.sessions || state.dirty.settings || state.dirty.usage || state.dirty.affProducts) {
        clearTimeout(state.timer);
        state.timer = setTimeout(pushAll, 300);
      } else {
        setInd('ok');
      }
    } finally {
      state.suppress = false;
    }
  }

  function cloudErrorHint(e) {
    var s = (e && (e.message || e.error_description || e.code || '')) || String(e || '');
    if (s.indexOf('PGRST205') !== -1 || s.indexOf('Could not find the table') !== -1) return 'Tabel belum ada — jalankan supabase/schema.sql di SQL Editor Supabase.';
    if (s.indexOf('422') !== -1 || /anonymous/i.test(s)) return 'Anonymous sign-in belum diaktifkan — Settings → Auth → Providers → Anonymous.';
    if (s.indexOf('401') !== -1) return 'Kunci Supabase tidak valid — periksa SUPABASE_ANON_KEY di Vercel.';
    return null;
  }
  function cloudErr(msg, e) {
    var hint = cloudErrorHint(e);
    setInd('err', hint ? (msg + ' — ' + hint) : msg);
    return hint;
  }

  function pullAll() {
    if (!state.enabled || !state.ready || !state.user || state.syncing) return;
    state.syncing = true;
    setInd('sync');
    var uid = state.user.id;
    Promise.all([
      state.client.from('sessions').select('id,name,data,updated_at').then(function (r) { if (r.error) throw r.error; return r.data; }),
      state.client.from('settings').select('settings,updated_at').maybeSingle().then(function (r) { if (r.error) throw r.error; return r.data; }),
      state.client.from('usage').select('date,requests').gte('date', todayStr()).order('date', { ascending: false }).limit(1).then(function (r) { if (r.error) throw r.error; return r.data && r.data[0]; }),
      state.client.from('affproducts').select('id,product,updated_at').then(function (r) { if (r.error) throw r.error; return r.data; })
    ]).then(function (res) {
      var rows = res[0] || [];
      rows.__settings = res[1];
      rows.__usage = res[2];
      rows.__aff = res[3] || [];
      mergeCloud(rows, true, true, true);
    }).catch(function (e) {
      log('pull gagal', e);
      cloudErr('Gagal memuat data cloud', e && e.message ? e.message : e);
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
      if (state.affChannel) { state.client.removeChannel(state.affChannel); state.affChannel = null; }
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
      var ac = state.client.channel('affproducts-' + state.user.id);
      ac.on('postgres_changes', {
        event: '*', schema: 'public', table: 'affproducts', filter: 'user_id=eq.' + state.user.id
      }, function () {
        if (state.suppress || state.syncing) return;
        clearTimeout(state.timer);
        state.timer = setTimeout(pullAll, 800);
      });
      ac.subscribe();
      state.affChannel = ac;
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

  /* Endpoint anonymous beda per versi GoTrue:
       - lama:            POST /auth/v1/signin/anonymous  (dipakai supabase-js 2.112.3)
       - LibreAuth baru:  POST /auth/v1/signup kosong → session anonim
     Di server ini (/auth/v1/settings → external.anonymous_users:true) rute lama
     ternyata 404. Bila signInAnonymously gagal 404, fallback manual via /signup
     lalu setSession agar seluruh alur pull/push tetap berjalan. */
  function anonViaSignup(cfg) {
    return fetch((cfg.supabaseUrl || '').replace(/\/+$/, '') + '/auth/v1/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.supabaseAnonKey || '',
        'Authorization': 'Bearer ' + (cfg.supabaseAnonKey || '')
      },
      body: '{}'
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.access_token) throw new Error((j && (j.error_description || j.msg || j.error)) || 'fallback anon /signup gagal');
      return j;
    });
  }

  function runAnonSignIn(cfg) {
    return state.client.auth.signInAnonymously()
      .then(function (r) { if (r.error) throw r.error; return r; })
      .catch(function (e) {
        var is404 = e && (e.status === 404 || /404/.test(String((e.message || e.code) || '')));
        if (is404 && cfg && cfg.supabaseUrl) {
          log('signInAnonymously tak didukung server ini → fallback /signup', e);
          return anonViaSignup(cfg).then(function (j) {
            return state.client.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token })
              .then(function (x) { if (x && x.error) throw x.error; log('anon via /signup OK'); });
          });
        }
        throw e;
      })
      .catch(function (e) {
        log('signInAnon gagal', e);
        var hint = cloudErrorHint(e && e.message ? e.message : e);
        if (hint) { setInd('err', hint); log(hint); return; }
        setInd('err', 'Autentikasi anonim gagal — periksa pengaturan Auth (Anonymous sign-ins) & koneksi.');
      });
  }

  function linkEmail(email, password) {
    if (!state.user) return Promise.resolve('Belum terautentikasi.');
    return state.client.auth.updateUser({ email: email, password: password })
      .then(function (r) {
        if (r.error) throw r.error;
        return 'Konfirmasi dikirim ke ' + email + '. Klik tautannya, lalu pakai email+password ini saat Masuk di perangkat mana pun.';
      })
      .catch(function (e) {
        var m = e && (e.message || e) || e;
        m = String(m);
        if (/already registered|user_already_exists|already been registered/i.test(m)) return 'Email ' + email + ' sudah dipakai akun lain. Gunakan Masuk dengan email+password yang sama, atau pakai email lain.';
        if (/password/i.test(m) && /(character|length|6)/i.test(m)) return 'Password minimal 6 karakter.';
        return 'Gagal menghubungkan: ' + m;
      });
  }

  function signInEmail(email, password) {
    return state.client.auth.signInWithPassword({ email: email, password: password })
      .then(function (r) {
        if (r.error) throw r.error;
        return 'Berhasil masuk: ' + email + '. Riwayat akun ini kini tampil di perangkat ini.';
      })
      .catch(function (e) {
        var m = String((e && (e.message || e)) || e);
        if (/invalid login credentials/i.test(m)) return 'Email/password salah.';
        if (/not confirmed/i.test(m)) return 'Email ' + email + ' belum dikonfirmasi — cek kotak masuknya.';
        throw e; /* biarkan handler umum menampilkan pesan */
      });
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
    var msg = $('cloud-msg'), emailWrap = $('cloud-email-wrap'), passWrap = $('cloud-pass-wrap');
    var emailNote = $('cloud-email-note'), loginNote = $('cloud-login-note');
    var linkBtn = $('btn-cloud-link'), loginBtn = $('btn-cloud-login'), outBtn = $('btn-cloud-out');
    function hideAll() {
      if (emailWrap) emailWrap.hidden = true;
      if (passWrap) passWrap.hidden = true;
      if (emailNote) emailNote.hidden = true;
      if (loginNote) loginNote.hidden = true;
      if (linkBtn) linkBtn.hidden = true;
      if (loginBtn) loginBtn.hidden = true;
      if (outBtn) outBtn.hidden = true;
    }
    if (!state.enabled) {
      if (msg) msg.textContent = 'Sinkronisasi cloud belum aktif di lingkungan ini.';
      hideAll();
    } else if (!state.user) {
      if (msg) msg.textContent = 'Menunggu autentikasi...';
      hideAll();
    } else if (state.user.is_anonymous) {
      if (msg) msg.textContent = 'Tersambung sebagai pengguna anonim. Riwayat & data produk disinkronkan otomatis (cadangan perangkat ini). Untuk lintas perangkat, buat akun email atau Masuk.';
      if (emailWrap) emailWrap.hidden = false;
      if (passWrap) passWrap.hidden = false;
      if (emailNote) emailNote.hidden = false;
      if (loginNote) loginNote.hidden = false;
      if (linkBtn) linkBtn.hidden = false;
      if (loginBtn) loginBtn.hidden = false;
      if (outBtn) outBtn.hidden = false;
    } else {
      if (msg) msg.textContent = 'Tersambung dengan akun: ' + (state.user.email || state.user.id) + '. Riwayat & data produk sinkron lintas perangkat.';
      hideAll();
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
        runAnonSignIn(cfg);
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
      var password = ($('cloud-password').value || '');
      if (!email) { $('cloud-msg').textContent = 'Masukkan alamat email.'; return; }
      if (password.length < 6) { $('cloud-msg').textContent = 'Password minimal 6 karakter.'; return; }
      linkBtn.disabled = true;
      linkEmail(email, password).then(function (m) {
        $('cloud-msg').textContent = m;
        if (!/Buat akun|sudah dipakai|Gagal/.test(m)) $('cloud-password').value = '';
        linkBtn.disabled = false;
      });
    });
    var loginBtn = $('btn-cloud-login');
    if (loginBtn) loginBtn.addEventListener('click', function () {
      var email = ($('cloud-email').value || '').trim();
      var password = ($('cloud-password').value || '');
      if (!email || !password) { $('cloud-msg').textContent = 'Isi email dan password.'; return; }
      loginBtn.disabled = true;
      signInEmail(email, password)
        .then(function (m) {
          $('cloud-msg').textContent = m;
          $('cloud-password').value = '';
          setTimeout(function () { openCloudModal(); }, 250);
          loginBtn.disabled = false;
        })
        .catch(function (e) {
          $('cloud-msg').textContent = 'Gagal masuk: ' + (e && e.message || e);
          loginBtn.disabled = false;
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
    if (window.cangcilung) window.cangcilung.openCloudModal = openCloudModal;
  });
})();
