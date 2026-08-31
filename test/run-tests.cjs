/* Unit/sanity test dasar cangcilung — dijalankan: `node test/run-tests.cjs`
   Tanpa framework: mock window, eval file browser, lalu asersi. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const results = [];
const errors = [];

function suite(name) {
  results.push('== ' + name + ' ==');
}
function loadBrowser(file) {
  const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const w = global.window || {};
  global.window = w;
  eval(code); // jshint ignore:line
  return w;
}
function assert(cond, msg) {
  if (cond) { pass++; results.push('  ok: ' + msg); }
  else { fail++; errors.push('FAIL: ' + msg); results.push('  FAIL: ' + msg); }
}
function close(actual, expected, eps) {
  return Math.abs(actual - expected) < (eps == null ? 1e-6 : eps);
}

/* ---------- safeeval ---------- */
suite('lib/safeeval.js (kalkulator internal)');
const w1 = loadBrowser('lib/safeeval.js');
(function () {
  const lib = w1.cangcilungLib;
  assert(lib && typeof lib.safeEval === 'function', 'safeEval terdefinisi');
  assert(close(lib.safeEval('15*24+7'), 367), '15*24+7 = 367 (got ' + lib.safeEval('15*24+7') + ')');
  assert(close(lib.safeEval('2^10'), 1024), '2^10 = 1024');
  assert(close(lib.safeEval('(2+3)*4'), 20), '(2+3)*4 = 20');
  assert(close(lib.safeEval('10/4'), 2.5), '10/4 = 2.5');
  assert(lib.safeEval('hello') === null, 'teks non-math -> null');
  assert(lib.safeEval('') === null, 'string kosong -> null');
  const ca = lib.calcAnswer('berapa 100*5');
  assert(ca && /500/.test(ca), 'calcAnswer("berapa 100*5") berisi 500');
})();

/* ---------- search.js ---------- */
suite('lib/search.js (deteksi ticker harga)');
const w2 = loadBrowser('lib/search.js');
(function () {
  const s = w2.CC.search;
  assert(s && typeof s.extractTicker === 'function', 'extractTicker terdefinisi');
  assert(s.extractTicker('harga xauusd') === 'GC=F', 'harga xauusd -> GC=F');
  assert(s.extractTicker('harga usa100') === '^NDX', 'harga usa100 -> ^NDX');
  assert(s.extractTicker('berapa usa100 sekarang') === '^NDX', 'berapa usa100 sekarang -> ^NDX');
  assert(s.extractTicker('harga saham AAPL') === 'AAPL', 'harga saham AAPL -> AAPL');
  assert(s.extractTicker('harga AAPL') === 'AAPL', 'harga AAPL -> AAPL');
  assert(s.extractTicker('cara membuat nasi goreng') === '', 'non-ticker -> ""');
  assert(s.chartSymbol('harga usa100') === 'NASDAQ:NDX', 'chartSymbol usa100 -> NASDAQ:NDX');
  assert(s.chartSymbol('chart xauusd') === 'OANDA:XAUUSD', 'chartSymbol xauusd -> OANDA:XAUUSD');
})();

/* ---------- stream.js ---------- */
suite('lib/stream.js (parser SSE)');
const w3 = loadBrowser('lib/stream.js');
(function () {
  const p = w3.CC.stream.parseSSEChunk;
  assert(typeof p === 'function', 'parseSSEChunk terdefinisi');
  let full = '';
  let doneCalled = false;
  const buf = { text: '', thinking: false };
  p('data: {"choices":[{"delta":{"content":"Hal"}}]}\n\n', buf, (d) => { full += d; }, () => { doneCalled = true; });
  p('data: {"choices":[{"delta":{"content":"o"}}]}\n\n', buf, (d) => { full += d; }, () => { doneCalled = true; });
  full += '!';
  assert(full === 'Halo!', 'delta content digabung: "Halo" + "o" + "!": ' + JSON.stringify(full));
  const buf2 = { text: '', thinking: false };
  p('data: [DONE]\n\n', buf2, () => {}, () => { doneCalled = true; });
  assert(doneCalled, 'data [DONE] memicu onDone');
})();

/* ---------- ringkasan ---------- */
fs.writeFileSync(path.join(ROOT, 'test', 'results.txt'), results.join('\n') + '\n');
console.log(results.join('\n'));
console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.error('\n' + errors.join('\n')); process.exit(1); }
