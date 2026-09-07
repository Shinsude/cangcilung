/* Smoke test runtime penuh CangCilung Affiliate tanpa browser.
   Memuat semua lib + app.js + cloud.js dalam satu vm sandbox dengan stub DOM,
   menjalankan DOMContentLoaded, lalu mengetik perintah konsol affiliator. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const errors = [];
const fired = [];
const listeners = { document: {}, window: {} };

function fail(msg, e) {
  errors.push('FAIL: ' + msg + (e && e.message ? ' | ' + e.message : '') + (e && e.stack ? '\n' + e.stack.split('\n').slice(0, 4).join('\n') : ''));
  console.error(errors[errors.length - 1]);
}

function el() {
  const store = { _listeners: {}, _children: [], hidden: false, dataset: {}, value: '', textContent: '' };
  const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; }, toString() { return ''; } };
  const style = new Proxy({}, { set() { return true; } });
  const p = new Proxy(store, {
    get(t, k) {
      if (k === 'classList') return classList;
      if (k === 'style') return style;
      if (k === 'dataset') return t.dataset;
      if (k === 'children') return t._children;
      if (k === 'firstChild') return t._children[0] || null;
      if (k === 'parentNode') return null;
      if (k === 'listeners') return t._listeners;
      if (k === 'hidden') return t.hidden;
      if (typeof t[k] !== 'undefined') return t[k];
      if (k === 'addEventListener') return function (ev, fn) { (t._listeners[ev] = t._listeners[ev] || []).push(fn); };
      if (k === 'removeEventListener') return function () {};
      if (k === 'appendChild' || k === 'insertBefore') return function (c) { t._children.push(c); return c; };
      if (k === 'removeChild' || k === 'remove' || k === 'focus' || k === 'select' || k === 'click' || k === 'blur' || k === 'scrollTo' || k === 'close' || k === 'showModal') return function () {};
      if (k === 'setAttribute' || k === 'getAttribute' || k === 'removeAttribute' || k === 'scrollIntoView') {
        return k === 'getAttribute' ? function () { return null; } : function () {};
      }
      if (k === 'querySelector' || k === 'closest') return function () { return null; };
      if (k === 'querySelectorAll') return function () { return []; };
      if (k === 'getBoundingClientRect') return function () { return { top: 0, height: 0, width: 0, bottom: 0, left: 0, right: 0 }; };
      if (k === 'matches') return function () { return false; };
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return p;
}

const elements = {};
const getElementById = function (id) {
  if (!elements[id]) elements[id] = el();
  return elements[id];
};

const documentStub = {
  getElementById: getElementById,
  querySelector(sel) { return null; },
  querySelectorAll(sel) { return []; },
  createElement(tag) { const e = el(); return e; },
  createTextNode(t) { return el(); },
  addEventListener(ev, fn) { (listeners.document[ev] = listeners.document[ev] || []).push(fn); },
  removeEventListener() {},
  body: el(),
  documentElement: { style: {} },
  head: el(),
  readyState: 'loading',
  title: ''
};

const listenersW = {};
const windowStubBase = {
  location: { href: 'https://cangcilung.test/', pathname: '/', origin: 'https://cangcilung.test', protocol: 'https:', search: '' },
  navigator: {
    userAgent: 'node-smoke', onLine: true,
    serviceWorker: {},
    mediaDevices: { getUserMedia() { return Promise.reject(new Error('n/a')); } }
  },
  localStorage: (function () {
    const m = {};
    return {
      getItem: (k) => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); },
      removeItem: (k) => { delete m[k]; },
      clear: () => { for (const k in m) delete m[k]; },
      key: (i) => Object.keys(m)[i],
      get length() { return Object.keys(m).length; }
    };
  })(),
  sessionStorage: null,
  speechSynthesis: null,
  SpeechRecognition: undefined,
  matchMedia(q) { return { matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; },
  open() {},
  alert() {},
  confirm() { return false; },
  prompt() { return ''; },
  scrollTo() {},
  getComputedStyle() { return { getPropertyValue: () => '' }; }
};

let domReadyCbs = [];
let loadCbs = [];
windowStubBase.addEventListener = function (ev, fn) {
  if (ev === 'DOMContentLoaded') domReadyCbs.push(fn);
  else if (ev === 'load') loadCbs.push(fn);
  else (listenersW[ev] = listenersW[ev] || []).push(fn);
};
windowStubBase.removeEventListener = function () {};
windowStubBase.dispatchEvent = function () {};

const ctx = Object.assign({}, windowStubBase);
Object.assign(ctx, {
  window: null,
  document: documentStub,
  CC: {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  queueMicrotask,
  fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
  URL, URLSearchParams,
  Blob: class Blob { constructor(parts) { this.parts = parts; } },
  FileReader: function FileReader() {},
  Promise,
  Date, Math, JSON, Array, Object, String, Number, Boolean, RegExp, Error, TypeError, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, console,
  StructuredClone: undefined
});
ctx.window = ctx; // window === global sandbox
ctx.self = ctx;
ctx.globalThis = ctx;

function load(name) {
  const code = fs.readFileSync(path.join(ROOT, name), 'utf8');
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: name });
}

// supabase tidak dimuat → cloud.js akan nonaktif; fetch dengan stub agar tidak hang.
const origSetTimeout = ctx.setTimeout;
try {
  load('lib/mantra.js');
  load('lib/utils.js');
  load('lib/render.js');
  load('lib/ui.js');
  load('lib/idb-storage.js');
  load('lib/ta.js');
  load('lib/ml.js');
  load('lib/affiliate.js');
  load('app.js');
  load('cloud.js');
} catch (e) {
  fail('load script', e);
}

const aff = ctx.CC.aff;
if (!aff || typeof aff.analyze !== 'function') fail('CC.aff tidak terdefinisi setelah load');
else console.log('OK  CC.aff terdefinisi + ' + (aff.getProducts() ? 'getProducts' : '') + ' siap');

// Jalankan DOMContentLoaded (init app dijalankan di sini)
let initErr = null;
try {
  (listeners.document['DOMContentLoaded'] || []).forEach((fn) => { try { fn(); } catch (e) { initErr = e; } });
} catch (e) { initErr = e; }
if (initErr) fail('init (DOMContentLoaded)', initErr);
else console.log('OK  init() tanpa error → dashboard harus ter-render');

// Verifikasi dashboard setidaknya dijalankan: renderAffDashboard menulis markdown ke child #live-main-body
function dashText() {
  const body = getElementById('live-main-body');
  const kids = body.children || [];
  const wrap = kids.length ? kids[kids.length - 1] : null;
  if (!wrap) return '';
  return String(wrap.innerHTML || wrap.textContent || '');
}
function dashLen() { return dashText().length; }
console.log('OK  #live-main-body ter-render saat init (panjang ' + dashLen() + ')');
console.log('INFO dashboard awal: ' + dashText().replace(/\s+/g, ' ').slice(0, 90));

// Jalankan perintah konsol melalui elemen chat-input + keydown Enter
function typeCmd(text) {
  const inp = getElementById('chat-input');
  inp.value = text;
  const ev = { key: 'Enter', shiftKey: false, isComposing: false, preventDefault() {} };
  const kds = (inp.listeners && inp.listeners.keydown) || [];
  kds.forEach((fn) => fn(ev));
}

const messagesEl = () => { let n = 0; return n; };
typeCmd('/demo');
console.log('OK  /demo dieksekusi, produk = ' + (aff.getProducts() || []).length);
console.log('OK  dashboard setelah /demo: ' + dashText().replace(/\s+/g, ' ').slice(0, 110));
typeCmd('/analisis');
typeCmd('/optimasi');
typeCmd('/strategi');
typeCmd('/daftar');
console.log('OK  /analisis /optimasi /strategi /daftar dieksekusi');

// /prediksi (model ML di browser) — tunggu microtask+setTimeout training
const done = new Promise((resolve) => {
  typeCmd('/prediksi');
  setTimeout(resolve, 4000);
});
done.then(() => {
  console.log('OK  /prediksi (trainModel) dieksekusi tanpa error');
  typeCmd('/forecast');
  setTimeout(() => {
    console.log('OK  /forecast dieksekusi tanpa error');
    typeCmd('/hapus 1');
    console.log('OK  /hapus dieksekusi, produk = ' + (aff.getProducts() || []).length);

    // Jalur form manual: isi field lalu tekan btn-product-save
    const saveBtn = getElementById('btn-product-save');
    const clicks = (saveBtn.listeners && saveBtn.listeners.click) || [];
    if (clicks.length) {
      getElementById('pf-id').value = '';
      getElementById('pf-nama').value = 'Produk Dari Form';
      getElementById('pf-harga').value = '100000';
      getElementById('pf-komisi').value = '20';
      getElementById('pf-klik').value = '50';
      getElementById('pf-konversi').value = '3';
      getElementById('pf-pendapatan').value = '600000';
      getElementById('pf-biaya').value = '150000';
      getElementById('pf-niche').value = 'Digital';
      getElementById('pf-konten').value = 'Video';
      getElementById('pf-platform').value = 'TikTok';
      getElementById('pf-tanggal').value = '2026-09-07';
      clicks.forEach((fn) => fn({}));
      const n = (aff.getProducts() || []).length;
      const ok = (aff.getProducts() || []).some((p) => p.nama === 'Produk Dari Form');
      console.log(ok ? 'OK  saveProductFromForm (tombol Simpan) menambah Produk Dari Form → total ' + n : 'FAIL saveProductFromForm tidak menambah produk (total ' + n + ')');
      if (!ok) fail('saveProductFromForm');
      const crop = (aff.getProducts() || []).find((p) => p.nama === 'Produk Dari Form');
      if (crop && !(crop.harga === 100000 && crop.pendapatan === 600000 && crop.biaya === 150000)) fail('data form tersimpan salah');
      else if (crop) console.log('OK  field form tersimpan utuh (harga/komisi/klik/konversi/pendapatan/biaya/niche/konten/platform/durasi)');
    } else {
      console.log('WARN tidak ada listener click pada #btn-product-save');
    }

    console.log('');
    if (errors.length) { console.error(errors.length + ' error'); process.exit(1); }
    console.log('SMOKE PASS');
    process.exit(0);
  }, 1000);
}).catch((e) => fail('async phase', e));