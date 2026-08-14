"use client";

import { useEffect, useRef, useState } from "react";
import { API_URL, WS_URL } from "@/lib/types";
import type { Dashboard, InsightData, MarketPrices, Quote } from "@/lib/types";

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [prices, setPrices] = useState<MarketPrices>({});
  const [feed, setFeed] = useState<"connecting" | "online" | "offline">("connecting");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const priceHistory = useRef<Record<string, number[]>>({});

  useEffect(() => {
    let fallback: ReturnType<typeof setInterval> | null = null;
    let ws: WebSocket | null = null;
    let staleWatchdog: ReturnType<typeof setInterval> | null = null;
    let lastWsData = 0;

    const applyPrices = (next: MarketPrices) => {
      setPrices(next);
      setLastUpdate(Date.now());
      for (const sym of Object.keys(next)) {
        const h = priceHistory.current[sym] || [];
        h.push(next[sym].bid);
        if (h.length > 20) h.splice(0, h.length - 20);
        priceHistory.current[sym] = h;
      }
    };

    const pollPrices = () => {
      fetch(`${API_URL}/public/prices`, { signal: AbortSignal.timeout(5000) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && d.prices && Object.keys(d.prices).length) {
            lastWsData = Date.now();
            applyPrices(d.prices);
          }
        })
        .catch(() => {});
    };

    const startFallback = () => {
      if (fallback) return;
      fallback = setInterval(pollPrices, 2000);
      pollPrices();
    };

    const stopFallback = () => {
      if (fallback) {
        clearInterval(fallback);
        fallback = null;
      }
    };

    fetch(`${API_URL}/public/dashboard`, { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setData(d);
          if (d.market_prices && Object.keys(d.market_prices).length) {
            applyPrices(d.market_prices);
          }
        }
      })
      .catch(() => {});

    staleWatchdog = setInterval(() => {
      if (Date.now() - lastWsData > 5000) startFallback();
    }, 2000);

    const connect = () => {
      setFeed("connecting");
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        setFeed("online");
        lastWsData = Date.now();
        stopFallback();
      };
      ws.onmessage = (evt) => {
        try {
          const d = JSON.parse(evt.data);
          if (d.type === "tick" && d.prices) {
            lastWsData = Date.now();
            stopFallback();
            applyPrices(d.prices);
          }
        } catch {}
      };
      ws.onclose = () => {
        setFeed("offline");
        startFallback();
        setTimeout(connect, 3000);
      };
      ws.onerror = () => {
        setFeed("connecting");
        startFallback();
        ws?.close();
      };
    };

    setTimeout(connect, 300);
    return () => {
      stopFallback();
      if (staleWatchdog) clearInterval(staleWatchdog);
      ws?.close();
    };
  }, []);

  const d = data?.insight_data || null;

  return (
    <main className="min-h-screen">
      <Header feed={feed} openPositions={data?.open_positions ?? 0} />

      <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
        {d ? (
          <SignalCard insight={d} prices={prices} />
        ) : (
          <Card label="SIGNAL">Memuat data...</Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card label="MARKET">
            <MarketTable prices={prices} history={priceHistory.current} lastUpdate={lastUpdate} />
          </Card>
          <Card label="ML">
            <MlStatus ml={data?.ml_status} />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card label="P&L">
            <PnL pnl={data?.pnl_summary} />
          </Card>
          <Card label="ECO CALENDAR">
            <EcoCal eco={data?.eco_cal} />
          </Card>
          <Card label="PIPELINE">
            <Pipeline health={data?.pipeline_health} />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card label="QUEUES">
            <Queues
              feedDepth={data?.feed_pool_queue_depth}
              mt5Depth={data?.mt5_queue_depth}
              system={data?.system_analysis}
            />
          </Card>
          <Card label="REJECTIONS / CR">
            <Rejections
              counters={data?.rejection_counters}
              reasons={data?.rejection_reasons}
              cr={data?.cr_engine_stats}
            />
          </Card>
        </div>

        <Card label="SYSTEM">
          <SystemInfo db={data?.db_health} system={data?.system_analysis} />
        </Card>
      </div>
    </main>
  );
}

function Header({ feed, openPositions }: { feed: string; openPositions: number }) {
  return (
    <header className="border-b border-border bg-card/40">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
        <div>
          <div className="text-lg font-semibold tracking-wide">K-SYNTHESIZER</div>
          <div className="text-[10px] tracking-widest text-slate-500">TCIP IS REAL</div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <StatusDot feed={feed} />
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
            BETA
          </span>
          <span className="text-slate-500">{openPositions} posisi</span>
        </div>
      </div>
      <div className="border-t border-border/50 px-4 py-1.5 text-[10px] text-slate-500">
        PROP ACC — LATENCY MAY VARY. TRADING CARRIES HIGH RISK. ALWAYS CONDUCT YOUR OWN RESEARCH.
      </div>
    </header>
  );
}

function StatusDot({ feed }: { feed: string }) {
  const color =
    feed === "online" ? "bg-bullish" : feed === "connecting" ? "bg-warning" : "bg-bearish";
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {feed}
    </span>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="text-xs font-semibold tracking-widest text-slate-400">{label}</span>
      </div>
      {children}
    </div>
  );
}

function fmt(n: number | undefined, digits = 2) {
  if (n === undefined || n === null || Number.isNaN(n)) return "-";
  return n.toFixed(digits);
}

function SignalCard({ insight, prices }: { insight: InsightData; prices: MarketPrices }) {
  const mode = insight.ai_available
    ? (insight.ai_provider || "SYNTHESIZER")
    : "TCIP MODE";
  const dirColor =
    insight.direction === "BUY" ? "text-bullish" : insight.direction === "SELL" ? "text-bearish" : "text-slate-300";
  const radar = [
    { n: "TCIP", v: insight.tcip_component },
    { n: "KEY", v: insight.key_level_score },
    { n: "CNDL", v: insight.candle_score },
    { n: "SESN", v: insight.session_score },
    { n: "ATR", v: insight.atr_score },
    { n: "ML", v: insight.ml_component },
  ];

  return (
    <Card label="SIGNAL">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-3xl font-bold ${dirColor}`}>{insight.direction || "-"}</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-sm">{insight.grade}</span>
            <span className="font-mono text-sm text-slate-400">{insight.symbol} {insight.timeframe}</span>
            {insight.holy_grail ? (
              <span className="rounded border border-amber-400/40 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                * HOLYGRAIL
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
              {mode}
            </span>
            <span className="text-slate-400">
              verdict <b className={insight.verdict === "REJECT" ? "text-bearish" : "text-bullish"}>{insight.verdict}</b>
            </span>
            <span className="text-slate-400">conf <b>{insight.confidence}</b></span>
            <span className="text-slate-400">risk <b>{insight.risk_level}</b></span>
            <span className="text-slate-400">phase <b>{insight.phase}</b></span>
          </div>
          <div className="mt-2 font-mono text-sm text-slate-400">
            price <span className="text-slate-200">{fmt(insight.current_price, 3)}</span>
          </div>
        </div>
        <div className="min-w-[220px]">
          {radar.map((r) => (
            <div key={r.n} className="mb-1 flex items-center gap-2 text-xs">
              <span className="w-10 font-mono text-slate-500">{r.n}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                <div
                  className={`h-full ${r.v >= 60 ? "bg-bullish" : r.v >= 40 ? "bg-warning" : "bg-bearish"}`}
                  style={{ width: `${r.v}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono">{fmt(r.v, 1)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function MarketTable({
  prices,
  history,
  lastUpdate,
}: {
  prices: MarketPrices;
  history: Record<string, number[]>;
  lastUpdate: number | null;
}) {
  const syms = Object.keys(prices);
  return (
    <div>
      <div className="mb-2 text-[10px] text-slate-500">
        {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "-"}
      </div>
      {syms.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500">Belum ada data quote.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-widest text-slate-500">
                <th className="py-2 font-medium">SYMBOL</th>
                <th className="font-medium">BID</th>
                <th className="font-medium">ASK</th>
                <th className="font-medium">SPR</th>
                <th className="font-medium">CHG</th>
                <th className="font-medium">TREND</th>
              </tr>
            </thead>
            <tbody>
              {syms.map((sym) => {
                const q: Quote = prices[sym];
                const h = history[sym] || [];
                return (
                  <tr key={sym} className="border-b border-border/60">
                    <td className="py-2 font-medium">{sym}</td>
                    <td className="font-mono">{fmt(q.bid, q.digits ?? 3)}</td>
                    <td className="font-mono">{fmt(q.ask, q.digits ?? 3)}</td>
                    <td className="font-mono text-slate-400">{q.spread}</td>
                    <td className={`font-mono ${(q.change ?? 0) >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {fmt(q.change)}%
                    </td>
                    <td>
                      <Sparkline values={h} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-slate-600">...</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 80},${14 - ((v - min) / range) * 12}`)
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width="80" height="16" viewBox="0 0 80 16" className="block">
      <polyline points={pts} fill="none" stroke={up ? "#22c55e" : "#ef4444"} strokeWidth="1.5" />
    </svg>
  );
}

function MlStatus({ ml }: { ml?: Record<string, unknown> }) {
  if (!ml) return <div className="text-sm text-slate-500">Belum tersedia.</div>;
  const acc = (ml.accuracy as number) ?? 0;
  const rows = (ml.pattern_rates as Array<Record<string, unknown>>) || [];
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Cell label="Trained" value={String(ml.trained)} />
        <Cell label="Retrain" value={String(ml.retrain_count)} />
        <Cell label="Outcomes" value={String(ml.total_outcomes)} />
        <Cell label="Accuracy" value={`${(acc * 100).toFixed(1)}%`} />
      </div>
      <div className="pt-1">
        <div className="mb-1 text-[10px] tracking-widest text-slate-500">PATTERN RATES</div>
        {rows.map((r) => (
          <div key={String(r.pattern)} className="flex items-center justify-between border-b border-border/40 py-1 font-mono text-xs">
            <span>{String(r.pattern)}</span>
            <span>{String(r.wins)}/{String(r.total)} ({((r.win_rate as number) * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PnL({ pnl }: { pnl?: Record<string, unknown> }) {
  if (!pnl) return <div className="text-sm text-slate-500">Belum tersedia.</div>;
  const week = pnl.week as Record<string, unknown>;
  const month = pnl.month as Record<string, unknown>;
  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <Cell label="Week P&L" value={`$${Number(week?.pnl ?? 0).toFixed(2)}`} />
        <Cell label="Week WR" value={`${week?.win_rate}%`} />
        <Cell label="Month P&L" value={`$${Number(month?.pnl ?? 0).toFixed(2)}`} />
        <Cell label="Month WR" value={`${month?.win_rate}%`} />
      </div>
    </div>
  );
}

function EcoCal({ eco }: { eco?: Record<string, unknown> }) {
  const events = (eco?.next_events as Array<Record<string, unknown>>) || [];
  return (
    <div>
      {events.length === 0 ? (
        <div className="text-sm text-slate-500">Tidak ada event.</div>
      ) : (
        events.map((e, i) => (
          <div key={i} className="flex items-center justify-between border-b border-border/40 py-1.5 text-sm">
            <div>
              <div className="font-medium">{String(e.name)}</div>
              <div className="text-xs text-slate-500">{String(e.currency)} · {String(e.time_utc)}</div>
            </div>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                e.impact === "HIGH" ? "bg-bearish/20 text-bearish" : "bg-warning/20 text-warning"
              }`}
            >
              {String(e.impact)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function Pipeline({ health }: { health?: Record<string, unknown> }) {
  if (!health) return <div className="text-sm text-slate-500">Belum tersedia.</div>;
  const score = Number(health.health_score ?? 0) * 100;
  return (
    <div className="text-sm">
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>HEALTH</span>
        <span className="font-mono">{score.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-800">
        <div
          className={`h-full ${score >= 60 ? "bg-bullish" : score >= 35 ? "bg-warning" : "bg-bearish"}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
        <Cell label="Sigs/hr" value={String(health.signals_per_hour)} />
        <Cell label="Entry" value={`${(Number(health.entry_rate) * 100).toFixed(1)}%`} />
        <Cell label="CR rej" value={`${(Number(health.cr_rejection_rate) * 100).toFixed(1)}%`} />
        <Cell label="Base arrival" value={String(health.baseline_arrival)} />
      </div>
    </div>
  );
}

function Queues({ feedDepth, mt5Depth, system }: { feedDepth?: number; mt5Depth?: number; system?: Record<string, unknown> }) {
  const collectors = (system?.collectors as Record<string, Record<string, unknown>>) || {};
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <Cell label="Feed pool" value={String(feedDepth ?? 0)} />
      <Cell label="MT5 queue" value={String(mt5Depth ?? 0)} />
      <div className="col-span-2 pt-1">
        <div className="mb-1 text-[10px] tracking-widest text-slate-500">COLLECTORS</div>
        {Object.entries(collectors).map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-border/40 py-0.5 font-mono text-xs">
            <span>{k}</span>
            <span className="text-slate-500">{String(v.emits)} emits · {String(v.last_emit_age_s)}s</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Rejections({
  counters,
  reasons,
  cr,
}: {
  counters?: Record<string, unknown>;
  reasons?: Record<string, unknown>;
  cr?: Record<string, unknown>;
}) {
  const layerHealth = (cr?.last_layer_health as Record<string, Record<string, unknown>>) || {};
  return (
    <div className="text-sm">
      <div className="mb-1 text-[10px] tracking-widest text-slate-500">REJECTION COUNTERS</div>
      <div className="grid grid-cols-2 gap-2">
        {counters &&
          Object.entries(counters).map(([k, v]) => (
            <div key={k} className="flex justify-between font-mono text-xs">
              <span className="text-slate-400">{k}</span>
              <span>{String(v)}</span>
            </div>
          ))}
      </div>
      <div className="mb-1 mt-3 text-[10px] tracking-widest text-slate-500">LAYER HEALTH</div>
      {Object.entries(layerHealth).map(([k, v]) => (
        <div key={k} className="flex justify-between border-b border-border/40 py-0.5 font-mono text-xs">
          <span>{k} <span className="text-slate-600">w={String(v.weight)}</span></span>
          <span className={v.status === "ok" ? "text-bullish" : "text-bearish"}>{String(v.score)}</span>
        </div>
      ))}
    </div>
  );
}

function SystemInfo({ db, system }: { db?: Record<string, unknown>; system?: Record<string, unknown> }) {
  const tables = (db?.tables as Record<string, Record<string, unknown>>) || {};
  return (
    <div className="grid gap-4 text-sm md:grid-cols-2">
      <div>
        <div className="mb-1 text-[10px] tracking-widest text-slate-500">DB HEALTH</div>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Checks" value={`${String(db?.checks_valid)}/${String(db?.checks_total)}`} />
          <Cell label="Corrupt" value={String(db?.corrupt_count)} />
        </div>
        {Object.entries(tables).map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-border/40 py-0.5 font-mono text-xs">
            <span>{k}</span>
            <span className="text-slate-500">{String(v.rows)} rows</span>
          </div>
        ))}
      </div>
      <div>
        <div className="mb-1 text-[10px] tracking-widest text-slate-500">SYSTEM ANALYSIS</div>
        <Cell label="Proposals open" value={String(system?.proposals_open)} />
        <Cell label="Reports" value={String(system?.reports_total)} />
        <div className="mt-1 text-xs text-slate-400">{String((system?.latest_proposal as Record<string, unknown>)?.title)}</div>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-border/60 bg-slate-900/40 px-2 py-1.5">
      <span className="text-[10px] tracking-widest text-slate-500">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
