/* lib/idb-storage.js — IndexedDB-backed storage for cangcilung
 * Replaces localStorage for sessions, history, and settings to avoid quota limits.
 * Falls back to localStorage if IndexedDB is unavailable.
 */
(function () {
  'use strict';

  var CC = window.CC || (window.CC = {});

  var DB_NAME = 'cangcilung_data';
  var DB_VERSION = 1;
  var _db = null;
  var _ready = null;
  var _fallback = false;

  function open() {
    if (_ready) return _ready;
    _ready = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { _fallback = true; resolve(null); return; }
      try {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains('keyval')) db.createObjectStore('keyval');
        };
        req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
        req.onerror = function () { _fallback = true; resolve(null); };
      } catch (e) { _fallback = true; resolve(null); }
    });
    return _ready;
  }

  function _tx(mode) {
    if (!_db) return null;
    try {
      var tx = _db.transaction('keyval', mode);
      return tx.objectStore('keyval');
    } catch (e) { return null; }
  }

  function get(key, defaultVal) {
    return open().then(function () {
      if (_fallback) {
        try {
          var raw = localStorage.getItem(key);
          return raw != null ? JSON.parse(raw) : (defaultVal !== undefined ? defaultVal : null);
        } catch (e) { return defaultVal !== undefined ? defaultVal : null; }
      }
      return new Promise(function (resolve) {
        var store = _tx('readonly');
        if (!store) { resolve(defaultVal !== undefined ? defaultVal : null); return; }
        var req = store.get(key);
        req.onsuccess = function () { resolve(req.result !== undefined ? req.result : (defaultVal !== undefined ? defaultVal : null)); };
        req.onerror = function () { resolve(defaultVal !== undefined ? defaultVal : null); };
      });
    });
  }

  function set(key, val) {
    return open().then(function () {
      if (_fallback) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
        return true;
      }
      var store = _tx('readwrite');
      if (!store) return false;
      return new Promise(function (resolve) {
        var req = store.put(val, key);
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { resolve(false); };
      });
    });
  }

  function remove(key) {
    return open().then(function () {
      if (_fallback) {
        try { localStorage.removeItem(key); } catch (e) {}
        return true;
      }
      var store = _tx('readwrite');
      if (!store) return false;
      return new Promise(function (resolve) {
        var req = store.delete(key);
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { resolve(false); };
      });
    });
  }

  /* Migration: move localStorage data to IndexedDB on first load */
  function migrateFromLocalStorage(keys) {
    return open().then(function () {
      if (_fallback) return Promise.resolve(false);
      return get('_migrated_v1').then(function (done) {
        if (done) return false;
        var promises = [];
        keys.forEach(function (key) {
          try {
            var raw = localStorage.getItem(key);
            if (raw != null) {
              var val;
              try { val = JSON.parse(raw); } catch (e) { val = raw; }
              promises.push(set(key, val));
            }
          } catch (e) {}
        });
        return Promise.all(promises).then(function () { return set('_migrated_v1', true); });
      });
    });
  }

  /* Bulk set: write multiple key-value pairs atomically */
  function bulkSet(items) {
    return open().then(function () {
      if (_fallback) {
        items.forEach(function (pair) {
          try { localStorage.setItem(pair[0], JSON.stringify(pair[1])); } catch (e) {}
        });
        return true;
      }
      return new Promise(function (resolve) {
        var store = _tx('readwrite');
        if (!store) { resolve(false); return; }
        var pending = items.length;
        if (!pending) { resolve(true); return; }
        var ok = true;
        items.forEach(function (pair) {
          var req = store.put(pair[1], pair[0]);
          req.onsuccess = function () { if (--pending === 0) resolve(ok); };
          req.onerror = function () { ok = false; if (--pending === 0) resolve(false); };
        });
      });
    });
  }

  /* Export all data for backup */
  function exportAll(keys) {
    return open().then(function () {
      var result = {};
      var chain = Promise.resolve();
      keys.forEach(function (key) {
        chain = chain.then(function () {
          return get(key).then(function (val) { result[key] = val; });
        });
      });
      return chain.then(function () { return result; });
    });
  }

  /* Import data from backup */
  function importAll(items) {
    return bulkSet(Object.keys(items).map(function (k) { return [k, items[k]]; }));
  }

  CC.storage = {
    open: open,
    get: get,
    set: set,
    remove: remove,
    migrateFromLocalStorage: migrateFromLocalStorage,
    bulkSet: bulkSet,
    exportAll: exportAll,
    importAll: importAll,
    isFallback: function () { return _fallback; }
  };
})();
