import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'tcip-data');

function readJson(file) {
  try { return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')); } catch (e) { return null; }
}

function writeJson(file, val) {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(val, null, 2) + '\n');
}

function sameSignal(a, b) {
  if (!a || !b) return false;
  return a.symbol === b.symbol && a.timeframe === b.timeframe && a.direction === b.direction &&
    a.confidence === b.confidence && a.grade === b.grade && a.phase === b.phase;
}

function extractSignal(d) {
  if (!d || !d.symbol) return null;
  const price = d.current_price;
  return {
    symbol: String(d.symbol || '').toUpperCase(),
    timeframe: String(d.timeframe || 'M15').toUpperCase(),
    direction: String(d.direction || 'WAIT').toUpperCase(),
    confidence: d.confidence != null ? Math.round(Number(d.confidence)) : null,
    grade: String(d.grade || '').toUpperCase(),
    phase: String(d.phase || ''),
    risk_level: String(d.risk_level || ''),
    is_stale: !!d.is_stale,
    price: price != null ? Number(price) : null,
    updatedAt: Date.now()
  };
}

const out = { ok: false, status: 'offline', at: Date.now(), error: null };

try {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const res = await fetch('https://api.tcip.asia/public/dashboard', { signal: ctrl.signal });
  clearTimeout(timer);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const sig = extractSignal(data && data.decision);
  const statusOk = { ok: true, status: 'online', at: Date.now(), error: null };

  if (sig) {
    const prev = readJson('tcip-latest.json');
    const history = readJson('tcip-history.json') || [];
    const changed = !sameSignal(prev, sig);
    const newHistory = [sig].concat(history.filter(function (h) { return !sameSignal(h, sig); })).slice(0, 60);
    writeJson('tcip-latest.json', sig);
    writeJson('tcip-history.json', newHistory);
    writeJson('tcip-status.json', statusOk);
    out.ok = true; out.status = 'online'; out.changed = changed;
    out.signal = sig.symbol + ' ' + sig.timeframe + ' ' + sig.direction;
  } else {
    writeJson('tcip-status.json', statusOk);
    out.ok = true; out.status = 'online'; out.signal = null;
  }
} catch (e) {
  out.error = String((e && e.message) || e).slice(0, 200);
  const prev = readJson('tcip-status.json');
  const lastFlip = prev && (Date.now() - (prev.at || 0));
  if (!prev || prev.status !== 'offline' || lastFlip > 15 * 60 * 1000) {
    writeJson('tcip-status.json', out);
  }
}

process.stdout.write(JSON.stringify(out) + '\n');
