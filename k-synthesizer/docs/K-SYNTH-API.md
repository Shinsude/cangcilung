# K-Synthesizer API Contract

Dokumen ini adalah kontrak API asli `tcip.asia` / `api.tcip.asia` yang divalidasi dari
snapshot nyata (`tcip_probe.json`, 2026-08-13) dan kode dashboard asli (`dashboard_full.js`).
Digunakan sebagai basis rekonstruksi. Bukan asumsi generik.

## Endpoint

```
GET https://api.tcip.asia/public/dashboard   -> payload penuh
GET https://api.tcip.asia/public/prices      -> { "prices": { <symbol>: <quote> } }   (fallback REST)
GET https://api.tcip.asia/public/orders      -> { "orders": [...] }                   (pending orders)

WS  wss://tcip.asia/ws                        -> event { "type": "tick", "prices": { <symbol>: <quote> } }
```

Aturan klien asli:

- WS utama; bila tidak ada data selama >5 dtk -> mulai poll `/public/prices` tiap 2 dtk.
- Setiap kartu dirender dalam try/catch terpisah agar satu kartu gagal tidak menggagalkan sisanya.

## Kontrak `/public/dashboard`

```
status                      "ok"
open_positions              int
open_details[]              { symbol, type, entry_price, sl, tp, lot, profit,
                               current_price, trail_level, trail_label, profit_locked }
recent_signals[]            { symbol, timeframe, direction, grade, verdict, unified_score,
                               outcome, timestamp }
engine                      { status, symbols[] }
insight_data                objek terbesar (lihat bagian berikut)
market_prices               { <symbol>: { bid, ask, spread, time, time_utc, stale, tick_age,
                               digits, last, change, daily_high, daily_low } }
pnl_summary                 { today, week, month, daily_breakdown[], loading }
ml_status                   { trained, retrain_count, total_outcomes, accuracy, pattern_rates[],
                               calibration[], feature_importance[], drift{}, recent_alerts[] }
pipeline_health             { health_score, signals_per_hour, entry_rate, cr_rejection_rate,
                               baseline_arrival, baseline_entry_pct, baseline_cr_pct }
system_analysis             { enabled, running, last_run_ts, proposals_open, proposals_total,
                               reports_total, latest_proposal{}, collectors{} }
eco_cal                     { blocked, next_events[] }
rejection_counters          { sr_proximity, ai_buffered_skip, signal_filter, phase_gate }
rejection_reasons           { <counter>: <teks alasan> }
fast_path_gate_rejections   { bar_opposing, counter_trend, rsi_extreme }
cr_engine_stats             { total_processed, total_rejected, total_tradeable,
                               by_verdict{}, by_reject_reason{}, tcip_cache_evictions,
                               config{ bobot layer }, layer_performance{},
                               last_layer_health{ tcip|bar|key_level|candle|session|atr|history|ml },
                               last_pool_healthy, layer_alert_streaks{}, layer_alerted[],
                               layer_alert_threshold, layer_alert_cooldown_s,
                               layer_last_event_ts{}, layer_cooldown_remaining{} }
db_health                   { db_health_available, checks_total, checks_valid, corrupt_count,
                               corrupt_keys[], prefixes{}, tables{}, last_verified, cached,
                               last_signal_age_s }
ai_analyzing                bool
feed_pool_queue_depth       int
mt5_queue_depth             int
pnl_cache_age               number (detik)
pnl_cache_server_time       ISO-8601
```

### Bobot layer (cr_engine_stats.config)

```
tcip_weight: 0.35    key_level_weight: 0.08    candle_weight: 0.10
bar_strength_weight: 0.03   session_weight: 0.04   atr_weight: 0.05
history_weight: 0.03        ml_weight: 0.25
```

## Kontrak `insight_data`

Kelompok semantik (dari snapshot XAUUSD M15 SELL):

- **Identitas**: `analysis_mode`, `symbol`, `timeframe`, `direction`, `phase`, `session_name`
- **Keputusan**: `verdict`, `decision`, `final_reco`, `grade`, `risk_level`, `filter_reason`,
  `hierarchy_reason`, `ml_rejected`, `inferred_reversal`, `reversal_confidence`
- **Skor radar 6 komponen**: `tcip_component`, `key_level_score`, `candle_score`, `session_score`,
  `atr_score`, `ml_component`; tambahan `bar_total_score`, `composite_score`, `tech_score`,
  `institutional_flow_score`, `coherence_score`, `confidence`, `confidence_raw`,
  `calibrated_confidence`, `unified_score`, `confluence_score`
- **Multi-timeframe**: `mtf_d1_dir/score`, `mtf_h4_*`, `mtf_h1_*`, `mtf_m30_*`, `mtf_m15_*`,
  `mtf_warnings[]`, `tech_mtf_aligned`, `weighted_alignment`, `trend_consistency_pct`
- **Regime**: `regime`, `decomp_regime`, `volatility_regime`, `market_quality`
- **Harga/level**: `current_price`, `entry_price`, `support_price`, `resistance_price`,
  `nearest_support`, `nearest_resistance`, `spread_points`, `atr_points`, `atr`,
  `suggested_sl_pips`, `suggested_tp_pips`, `risk_reward`
- **Indikator**: `rsi_14`, `macd_line`, `macd_signal`, `macd_hist`, `bb_pct_b`, `cvd`,
  `current_cvd`, `cvd_efficiency`, `net_flow`
- **Bar**: `bar_level`, `bar_opposing`, `bar_direction`
- **AI**: `ai_available`, `ai_provider`, `ml_confidence`, `theta_ai_wr`, `theta_rules_wr`,
  `theta_total`, `theta_divergence`, `rag_win_rate`, `rag_total_similar`
- **Safety/roll**: `safety_bounds_violated`, `safety_bounds_total`, `safety_status`,
  `roll_under_reco`, `roll_under_risk`, `minutes_to_roll`
- **SMC**: `smc_warning`, `smc_confluence`, `divergence_status`, `divergence_downgraded`
- **Konteks**: `primary_context`, `primary_bias`, `counter_trend_bias`, `counter_trend_strength`,
  `is_counter_trend`, `additional_confirmations`
- **Meta**: `is_stale`, `signal_born_ts`, `signal_age_s`, `publish_seq`, `holy_grail`, `god_mode`,
  `adaptive_lookback`, `stability`, `is_dead_zone`, `ts_intrinsic`, `ts_snr`, `warmup_degraded`,
  `flow_direction`, `weaknesses[]`, `rationale`, `session`

### `tcip_raw` (mirror EA TCIP.mq5, schema v2)

`source_build: "TCIP_3.18_AUDIT_FIX"`, `schema_version: 2`, `instance_id: "TCIP_BATTLE"`,
`write_ok`, `write_attempt`, `publish_seq`, `terminal_hash`, `timestamp`, detail bar,
`filter_reason: "NO_DOMINANT_SIDE"`, alignment flags, dll.

### `tcip_*` mirror (proyeksi flat)

`tcip_signal_phase`, `tcip_direction`, `tcip_grade`, `tcip_bar_direction`, `tcip_timestamp`,
`tcip_clock_drift_s`, `tcip_nearest_support`, `tcip_nearest_resistance`

## Simbol yang diamati

- `XAUUSD` (digits 3, spread poin ~182)
- `USTEC` (digits 2, spread poin ~89)

## Struktur halaman (dashboard asli)

Satu halaman dashboard, kartu-kartu dark glass 3D-tilt:

1. Header: logo, `K-SYNTHESIZER`, `TCIP IS REAL`, status-dot, badge BETA, tombol minimal,
   disclaimer PROP ACC
2. SIGNAL card: mode-pill (SYNTHESIZER / TCIP MODE / provider), holy-grail badge, MTF chips,
   radar 6 komponen, m15 progress
3. Market: tabel quote + sparkline, status feed
4. Info: metrics detail
5. ML: trained/accuracy/retrain/calibration/drift
6. P&L: today/week/month + daily breakdown
7. Eco Calendar: next_events + countdown
8. Queues: feed_pool & mt5 queue + riwayat sparkline
9. Pipeline: health gauge + baseline
10. Db Health: checks/corrupt/tables + last_signal_age
11. Positions & Pending Orders
12. Rejections/Cr: rejection counters, fast_path gate, cr_engine_stats, layer health
13. System Analysis: proposals/reports/collectors
