/* cangcilung — Basis pengetahuan (RAG permanen via pgvector).
   Dimuat SETELAH app.js. Tanpa cloud / tanpa embedKey, fitur nonaktif. */
(function () {
  'use strict';

  var state = { client: null, user: null, ready: false, hasDocs: false };

  function app() { return window.cangcilung || null; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /* ---------- config embedding ---------- */
  function embedCfg() {
    var s = app() ? app().getSettings() : {};
    return {
      baseUrl: (s.embedBaseUrl || 'https://api.jina.ai/v1').replace(/\/+$/, ''),
      key: s.embedKey || '',
      model: s.embedModel || 'jina-embeddings-v3'
    };
  }
  function canEmbed() { var c = embedCfg(); return !!(c.key && c.baseUrl); }
  function canRetrieve() { return state.ready && state.hasDocs && canEmbed(); }

  /* ---------- normalisasi & pad ke 1024 dimensi ---------- */
  function toVec(emb) {
    if (!emb || !emb.length) throw new Error('Embedding kosong');
    var norm = 0, i;
    for (i = 0; i < emb.length; i++) norm += emb[i] * emb[i];
    norm = Math.sqrt(norm) || 1;
    var v = new Array(1024);
    for (i = 0; i < 1024; i++) v[i] = (i < emb.length ? emb[i] / norm : 0);
    return v;
  }

  /* ---------- embedding (OpenAI-compatible /v1/embeddings) ---------- */
  function embedTexts(texts) {
    var c = embedCfg();
    return fetch(c.baseUrl + '/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key },
      body: JSON.stringify({ model: c.model, input: texts })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + (t ? ' — ' + t.slice(0, 150) : '')); });
      return r.json();
    }).then(function (j) {
      var arr = (j && j.data) || [];
      return texts.map(function (_, i) { return arr[i] ? arr[i].embedding : null; });
    });
  }

  /* ---------- chunking ---------- */
  function chunkText(text) {
    var size = 1200, overlap = 150, out = [], i = 0;
    text = (text || '').replace(/\s+/g, ' ').trim();
    while (i < text.length && out.length < 500) {
      out.push(text.slice(i, i + size));
      i += size - overlap;
    }
    return out.filter(function (c) { return c.trim().length >= 40; });
  }

  /* ---------- simpan dokumen + chunk ke cloud ---------- */
  function saveDocument(source, title, text, meta) {
    var a = app();
    if (!a || !state.ready) return Promise.reject(new Error('Sinkronisasi cloud belum aktif.'));
    if (!canEmbed()) return Promise.reject(new Error('Atur provider embedding dulu di Pengaturan (bagian Basis pengetahuan).'));
    var chunks = chunkText(text);
    if (!chunks.length) return Promise.reject(new Error('Teks terlalu pendek untuk disimpan.'));
    var docId = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var rows;
    return embedTexts(chunks).then(function (vecs) {
      rows = chunks.map(function (c, i) {
        return { user_id: state.user.id, id: 'c' + docId + '-' + i, document_id: docId, idx: i, content: c, embedding: toVec(vecs[i]) };
      });
      return state.client.from('documents').upsert({
        user_id: state.user.id, id: docId, title: title.slice(0, 200), source: source, meta: meta || {}
      }, { onConflict: 'user_id,id' }).then(function (r) { if (r.error) throw r.error; });
    }).then(function () {
      return state.client.from('chunks').upsert(rows, { onConflict: 'user_id,id' });
    }).then(function (r) {
      if (r.error) throw r.error;
      state.hasDocs = true;
      return { id: docId, count: rows.length };
    });
  }

  /* ---------- pencarian semantik ---------- */
  function retrieve(query) {
    if (!canRetrieve()) return Promise.resolve('');
    return embedTexts([query]).then(function (vecs) {
      var v = toVec(vecs[0]);
      return state.client.rpc('match_chunks', { query_embedding: v, match_count: 6, uid: state.user.id })
        .then(function (r) { if (r.error) throw r.error; return r.data || []; });
    }).then(function (rows) {
      if (!rows || !rows.length) return '';
      var ids = [], seen = {};
      rows.forEach(function (x) { if (!seen[x.document_id]) { seen[x.document_id] = 1; ids.push(x.document_id); } });
      return state.client.from('documents').select('id,title').in('id', ids).then(function (r) {
        var titles = {};
        if (!r.error) (r.data || []).forEach(function (d) { titles[d.id] = d.title; });
        return rows.map(function (x) {
          return '[' + (titles[x.document_id] || 'Dokumen') + ' · skor ' + Math.round((x.similarity || 0) * 100) + '%]\n' + x.content;
        }).join('\n\n---\n\n');
      }).catch(function () {
        return rows.map(function (x) { return x.content; }).join('\n\n---\n\n');
      });
    }).catch(function () { return ''; });
  }

  /* ---------- daftar & hapus dokumen ---------- */
  function listDocs() {
    if (!state.ready) return Promise.resolve([]);
    return Promise.all([
      state.client.from('documents').select('id,title,source,meta,created_at').order('created_at', { ascending: false }),
      state.client.from('chunks').select('document_id')
    ]).then(function (res) {
      var docs = res[0].error ? [] : (res[0].data || []);
      var counts = {};
      (res[1].error ? [] : (res[1].data || [])).forEach(function (c) { counts[c.document_id] = (counts[c.document_id] || 0) + 1; });
      return docs.map(function (d) {
        return { id: d.id, title: d.title, source: d.source, meta: d.meta || {}, createdAt: d.created_at, chunks: counts[d.id] || 0 };
      });
    });
  }

  function removeDoc(id) {
    return state.client.from('chunks').delete().eq('user_id', state.user.id).eq('document_id', id)
      .then(function (r) { if (r.error) throw r.error; })
      .then(function () { return state.client.from('documents').delete().eq('user_id', state.user.id).eq('id', id); })
      .then(function (r) { if (r.error) throw r.error; state.hasDocs = true; })
      .catch(function (err) { /* mungkin list kosong */ throw err; });
  }

  function hasDocsGate() {
    if (!state.ready) return;
    state.client.from('documents').select('id', { head: true }).then(function (r) {
      if (!r.error && r.count != null) state.hasDocs = r.count > 0;
    }).catch(function () {});
  }

  /* ---------- refresh tombol Simpan di chip ---------- */
  function refreshChip() {
    var a = app();
    if (a && a.refreshChip) a.refreshChip();
  }

  /* ---------- UI: simpan dari chip ---------- */
  function doSave() {
    var a = app();
    if (!a) return;
    var att = a.getAttachment ? a.getAttachment() : null;
    if (!att) return;
    if (!state.ready) { a.setStatus('Pengetahuan memerlukan sinkronisasi cloud aktif.', true); return; }
    if (!canEmbed()) {
      a.setStatus('Atur provider embedding dulu di Pengaturan (bagian Basis pengetahuan).', true);
      a.openModal('settings-modal');
      return;
    }
    var btn = $('btn-save-kb');
    if (btn) btn.disabled = true;
    a.setStatus('💾 Menyimpan ke basis pengetahuan...');
    saveDocument(att.name.startsWith('http') ? 'url' : 'file', att.name, att.text, { name: att.name }).then(function (r) {
      a.setStatus('✅ Disimpan: "' + att.name + '" (' + r.count + ' potongan). Cangcilung bisa menjawab soal isinya sekarang.');
      if (btn) btn.disabled = false;
    }).catch(function (e) {
      a.setStatus('Gagal simpan: ' + (e && e.message ? e.message : e), true);
      if (btn) btn.disabled = false;
    });
  }

  /* ---------- UI: modal Pengetahuan ---------- */
  function openKb() {
    var a = app();
    if (!a || !$('kb-modal')) return;
    var listEl = $('kb-list'), st = $('kb-status');
    if (!state.ready) {
      if (listEl) listEl.innerHTML = '<p class="set-hint">Sinkronisasi cloud belum aktif. Aktifkan di ☁️ Cloud dulu.</p>';
      if (st) st.textContent = '';
      a.openModal('kb-modal');
      return;
    }
    if (listEl) listEl.innerHTML = '';
    if (st) { st.textContent = 'Memuat...'; st.className = 'set-status'; }
    a.openModal('kb-modal');
    listDocs().then(function (docs) {
      if (st) st.textContent = '';
      if (!docs.length) {
        state.hasDocs = false;
        if (listEl) listEl.innerHTML = '<p class="set-hint">Belum ada dokumen. Lampirkan file/URL lalu klik <b>💾 Simpan</b>.</p>';
        return;
      }
      if (listEl) listEl.innerHTML = docs.map(function (d) {
        var icon = d.source === 'url' ? '🔗' : '📄';
        var meta = d.meta && d.meta.name ? ' · ' + esc(d.meta.name) : '';
        return '<div class="session-row">' +
          '<span class="session-name">' + icon + ' ' + esc(d.title) + meta + ' <span class="kb-count">(' + d.chunks + ' potongan)</span></span>' +
          '<button class="session-act" title="Hapus" data-kb-del="' + d.id + '">🗑️</button>' +
        '</div>';
      }).join('');
      Array.prototype.forEach.call(listEl.querySelectorAll('[data-kb-del]'), function (b) {
        b.addEventListener('click', function () {
          var id = b.getAttribute('data-kb-del');
          a.confirm('Hapus dokumen', 'Hapus dokumen ini dari basis pengetahuan secara permanen?', 'Hapus', function () {
            if (st) { st.textContent = 'Menghapus...'; st.className = 'set-status'; }
            removeDoc(id).then(function () { openKb(); }).catch(function (e) {
              if (st) { st.textContent = 'Gagal: ' + (e && e.message ? e.message : e); st.className = 'set-status error'; }
            });
          });
        });
      });
    }).catch(function (e) {
      if (st) { st.textContent = 'Gagal memuat: ' + (e && e.message ? e.message : e); st.className = 'set-status error'; }
    });
  }

  /* ---------- init ---------- */
  window.__kb = { canEmbed: canEmbed, canRetrieve: canRetrieve, retrieve: retrieve, openKb: openKb, refreshChip: refreshChip };

  document.addEventListener('DOMContentLoaded', function () {
    var btnKb = $('btn-kb');
    if (btnKb) btnKb.addEventListener('click', function () { closeToolsMenu(); openKb(); });
    var btnClose = $('btn-kb-close');
    if (btnClose) btnClose.addEventListener('click', function () { var a = app(); if (a) a.closeModal('kb-modal'); });
    var btnClose2 = $('btn-kb-close2');
    if (btnClose2) btnClose2.addEventListener('click', function () { var a = app(); if (a) a.closeModal('kb-modal'); });
    var kbModal = $('kb-modal');
    if (kbModal) kbModal.addEventListener('click', function (e) { if (e.target === kbModal) { var a = app(); if (a) a.closeModal('kb-modal'); } });
    var btnSave = $('btn-save-kb');
    if (btnSave) btnSave.addEventListener('click', doSave);

    function closeToolsMenu() { var m = $('tools-menu'); if (m) m.hidden = true; }

    if (window.__onCloudReady) window.__onCloudReady(function (client, user) {
      state.client = client;
      state.user = user;
      state.ready = true;
      hasDocsGate();
    });
  });
})();
