"""Simulasi state dashboard K-Synthesizer.

Generator ini mereplikasi kontrak `/public/dashboard` yang tervalidasi dari
snapshot asli `tcip_probe.json` (schema v2, TCIP 3.18 AUDIT_FIX). Nilai dibuat
deterministik-seeded agar stabil per simbol+timeframe, dengan drift harga kecil
agar dashboard terlihat hidup. Bukan random bebas.
"""

from __future__ import annotations

import hashlib
import math
import random
import time
from datetime import datetime, timezone


def _seed(*parts: str) -> int:
    return int(hashlib.sha256("|".join(parts).encode()).hexdigest()[:8], 16)


def _now_ts() -> float:
    return time.time()


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tick_price(base: float, symbol: str) -> float:
    seed = _seed(symbol, str(int(_now_ts() / 5)))
    rng = random.Random(seed)
    return round(base + rng.uniform(-0.15, 0.15), 3)


class KSynthState:
    def __init__(self) -> None:
        self.engine = {"status": "running", "symbols": ["XAUUSD", "USTEC"]}
        self.symbols = {
            "XAUUSD": {"base": 4409.80, "digits": 3, "spread": 182},
            "USTEC": {"base": 29790.25, "digits": 2, "spread": 89},
        }
        self.publish_seq = 85

    def market_prices(self) -> dict:
        out = {}
        for sym, cfg in self.symbols.items():
            price = _tick_price(cfg["base"], sym)
            out[sym] = {
                "bid": price,
                "ask": round(price + cfg["spread"] * (10 ** -cfg["digits"]), cfg["digits"]),
                "spread": cfg["spread"],
                "time": int(_now_ts()),
                "time_utc": _now_ts(),
                "stale": False,
                "tick_age": 1.0,
                "digits": cfg["digits"],
                "last": price,
                "change": round(random.Random(_seed(sym)).uniform(-0.3, 0.3), 2),
                "daily_high": round(cfg["base"] + 40, cfg["digits"]),
                "daily_low": round(cfg["base"] - 11, cfg["digits"]),
            }
        return out

    def insight_data(self) -> dict:
        self.publish_seq += 1
        rng = random.Random(_seed("insight", str(int(_now_ts() / 60))))
        symbol = "XAUUSD"
        timeframe = "M15"
        direction = rng.choice(["BUY", "SELL"])
        grade = rng.choice(["APLUS", "BPLUS", "BPLUS", "NEUTRAL"])
        phase = rng.choice(["FORMING", "FORMING", "CONFIRMED"])
        risk = {"APLUS": "LOW", "BPLUS": "MODERATE", "NEUTRAL": "MODERATE"}[grade]

        tcip_c = round(rng.uniform(30, 70), 1)
        key_c = round(rng.uniform(35, 85), 1)
        candle_c = round(rng.uniform(35, 85), 1)
        session_c = round(rng.uniform(30, 75), 1)
        atr_c = round(rng.uniform(30, 85), 1)
        ml_c = round(rng.uniform(25, 75), 1)

        weights = {"tcip": 0.35, "key": 0.08, "candle": 0.10, "bar": 0.03,
                   "session": 0.04, "atr": 0.05, "history": 0.03, "ml": 0.25}
        composite = round(
            tcip_c * weights["tcip"] + key_c * weights["key"] + candle_c * weights["candle"]
            + session_c * weights["session"] + atr_c * weights["atr"] + ml_c * weights["ml"],
            1,
        )

        price = _tick_price(self.symbols[symbol]["base"], symbol)
        atr = round(rng.uniform(5.5, 8.0), 4)
        sl = round(atr * 1.5, 1)
        tp = round(atr * 3.0, 1)
        verdict = "REJECT" if composite < 50 or grade == "NEUTRAL" else "ACCEPT"

        base = {
            "analysis_mode": "AI",
            "position_open": False,
            "symbol": symbol,
            "timeframe": timeframe,
            "direction": direction,
            "confidence": 0,
            "confidence_raw": 0.0,
            "grade": grade,
            "risk_level": risk,
            "decision": "",
            "final_reco": "",
            "weaknesses": [],
            "rationale": "",
            "phase": phase,
            "regime": "TACTICAL NEUTRAL",
            "decomp_regime": "CHOP",
            "volatility_regime": "LOW",
            "ts_intrinsic": 22.9,
            "ts_snr": 0.297,
            "mtf_d1_dir": "BULLISH",
            "mtf_h4_dir": "BEARISH",
            "mtf_h1_dir": "BEARISH",
            "mtf_m30_dir": "NEUTRAL",
            "mtf_m15_dir": direction,
            "ai_available": False,
            "ai_provider": "",
            "divergence_status": "NONE",
            "bar_opposing": False,
            "bar_level": "STRONG",
            "cvd": round(rng.uniform(-0.3, 0.5), 2),
            "cvd_efficiency": round(rng.uniform(0.1, 0.6), 2),
            "net_flow": round(rng.uniform(-400, 400), 1),
            "weighted_alignment": round(rng.uniform(-0.8, 0.8), 3),
            "trend_consistency_pct": 100,
            "is_stale": False,
            "mtf_warnings": [],
            "session": "",
            "signal_born_ts": _now_ts() - 60,
            "risk_reward": 2.0,
            "ml_rejected": False,
            "current_price": price,
            "tcip_component": tcip_c,
            "key_level_score": key_c,
            "candle_score": candle_c,
            "session_score": session_c,
            "atr_score": atr_c,
            "ml_component": ml_c,
            "market_quality": "INEFFICIENT +VOL",
            "warmup_degraded": False,
            "confluence_score": -1,
            "flow_direction": "NEUTRAL",
            "additional_confirmations": 1,
            "composite_score": composite,
            "institutional_flow_score": round(rng.uniform(30, 70), 1),
            "current_cvd": round(rng.uniform(-0.2, 0.4), 2),
            "ml_confidence": 0,
            "session_name": "TOKYO (LOW-MED)",
            "tech_mtf_aligned": True,
            "tech_score": round(rng.uniform(35, 65), 1),
            "coherence_score": 50.0,
            "calibrated_confidence": 0.0,
            "unified_score": 0.0,
            "mtf_d1_score": 18,
            "mtf_h4_score": -18,
            "mtf_h1_score": -6,
            "mtf_m30_score": 0,
            "mtf_m15_score": 0,
            "divergence_downgraded": False,
            "support_price": round(price - 13.7, 3),
            "resistance_price": round(price + 8.7, 3),
            "nearest_support": round(price - 1.6, 3),
            "nearest_resistance": round(price + 0.25, 3),
            "entry_price": price,
            "verdict": verdict,
            "entry_strength": "CORE STRONG",
            "signal_consistency": 0.0,
            "adaptive_lookback": 50,
            "stability": "LOW",
            "is_dead_zone": False,
            "bar_total_score": 30.0,
            "atr": atr,
            "suggested_sl_pips": sl,
            "suggested_tp_pips": tp,
            "signal_age_s": 1,
            "holy_grail": 0,
            "god_mode": 0,
            "inferred_reversal": "NONE",
            "reversal_confidence": 0.0,
            "smc_warning": True,
            "smc_confluence": 5,
            "filter_reason": "NO DOMINANT SIDE" if verdict == "REJECT" else "",
            "hierarchy_reason": "OVERRIDE ACTIVE",
            "tcip_write_ok": True,
            "tcip_write_attempt": 1,
            "rsi_14": round(rng.uniform(35, 65), 1),
            "macd_line": round(rng.uniform(-2, 2), 4),
            "macd_signal": round(rng.uniform(-2, 2), 4),
            "macd_hist": round(rng.uniform(-2, 2), 4),
            "bb_pct_b": round(rng.uniform(0.2, 0.8), 2),
            "roll_under_reco": "HOLD",
            "theta_ai_wr": 0.0,
            "theta_rules_wr": 0.0,
            "theta_total": 0,
            "theta_divergence": 0,
            "rag_win_rate": 0.5,
            "rag_total_similar": 0,
            "roll_under_risk": 0,
            "minutes_to_roll": 206,
            "safety_bounds_violated": 1,
            "safety_bounds_total": 6,
            "safety_status": "1 VIOLATED",
            "counter_trend_bias": "",
            "counter_trend_strength": 0,
            "is_counter_trend": False,
            "primary_context": "H4+H1 MOMENTUM",
            "primary_bias": "D1 BULLISH (H4 CONFLICT)",
            "publish_seq": self.publish_seq,
            "spread_points": self.symbols[symbol]["spread"],
            "atr_points": sl,
        }

        raw = {
            "schema_version": 2,
            "source_build": "TCIP_3.18_AUDIT_FIX",
            "write_ok": True,
            "write_attempt": 1,
            "publish_seq": self.publish_seq,
            "warmup_degraded": False,
            "symbol": symbol,
            "timeframe": timeframe,
            "timestamp": datetime.fromtimestamp(_now_ts(), tz=timezone.utc).isoformat(),
            "instance_id": "TCIP_BATTLE",
            "direction": direction,
            "consensus_bias": "",
            "grade": grade,
            "grade_numeric": {"APLUS": 5, "BPLUS": 3, "NEUTRAL": 0}.get(grade, 0),
            "confluence_score": -1,
            "tech_score": base["tech_score"],
            "institutional_flow_score": base["institutional_flow_score"],
            "net_flow": base["net_flow"],
            "buy_pressure": 3930.0,
            "sell_pressure": 4244.0,
            "cvd_efficiency": base["cvd_efficiency"],
            "composite_score": composite,
            "smoothed_composite_score": composite,
            "signal_consistency": 0.0,
            "grade_confidence_pct": 40.0,
            "adaptive_lookback": 50,
            "signal_phase": phase,
            "phase_hysteresis": 21.0,
            "bar_level": "STRONG",
            "bar_direction": "NEUTRAL",
            "bar_total_score": 30.0,
            "bar_confirm": False,
            "bar_opposing": False,
            "bar_body_ratio": 28.2,
            "bar_close_pos": 66.4,
            "bar_range_ratio": 0.16,
            "bar_volume_ratio": 0.13,
            "bar_engulfing": False,
            "bar_pin": False,
            "bar_doji": False,
            "divergence_status": "NONE",
            "divergence_downgraded": False,
            "cvd_div": "",
            "rsi_div": "",
            "macd_div": "",
            "cvd_boosted": False,
            "breakout_regime": False,
            "current_cvd": base["current_cvd"],
            "entry_strength": "CORE_STRONG",
            "additional_confirmations": 1,
            "primary_bias": "D1 BULLISH (H4 CONFLICT)",
            "secondary_bias": "MOMENTUM BEARISH",
            "primary_context": "H4+H1 MOMENTUM",
            "secondary_context": "MOMENTUM BEARISH",
            "market_quality": "INEFFICIENT +VOL",
            "market_efficiency": 0.5,
            "volume_ratio": 0.79,
            "flow_direction": "NEUTRAL",
            "current_price": price,
            "nearest_support": base["nearest_support"],
            "nearest_resistance": base["nearest_resistance"],
            "atr_points": sl,
            "atr_percent": 0.221,
            "volatility_ratio": 0.42,
            "spread_points": self.symbols[symbol]["spread"],
            "stability": "STABLE_LOW",
            "is_dead_zone": False,
            "is_extreme": False,
            "all_filters_pass": False,
            "filter_reason": "NO_DOMINANT_SIDE",
            "memory_strength": 50.0,
            "hierarchy_passed": True,
            "hierarchy_reason": "OVERRIDE_ACTIVE",
            "regime": "TACTICAL_NEUTRAL",
            "strength_score": 45.0,
            "strength_components": 2,
            "strength_dir": "BEARISH",
            "signal_confidence": 0.6,
            "signal_extreme": False,
            "counter_trend_bias": "",
            "counter_trend_strength": 0,
            "mtf_d1_dir": "BULLISH",
            "mtf_d1_score": 18,
            "mtf_h4_dir": "BEARISH",
            "mtf_h4_score": -18,
            "mtf_h1_dir": "BEARISH",
            "mtf_h1_score": -6,
            "mtf_m30_dir": "NEUTRAL",
            "mtf_m30_score": 0,
            "mtf_m15_dir": direction,
            "mtf_m15_score": 0,
            "w1_d1_aligned": True,
            "d1_h4_aligned": False,
            "h4_h1_aligned": True,
            "h1_m30_aligned": False,
            "m30_m15_aligned": False,
            "tech_mtf_aligned": True,
            "weighted_alignment": -0.734,
            "vah_value": None,
            "val_value": None,
            "poc_value": None,
            "clock_drift_s": None,
            "terminal_hash": "32918353",
            "rsi_14": base["rsi_14"],
            "macd_line": base["macd_line"],
            "macd_signal": base["macd_signal"],
            "macd_hist": base["macd_hist"],
            "bb_pct_b": base["bb_pct_b"],
        }

        base["tcip_raw"] = raw
        base["tcip_signal_phase"] = phase
        base["tcip_direction"] = direction
        base["tcip_grade"] = grade
        base["tcip_bar_direction"] = "NEUTRAL"
        base["tcip_timestamp"] = _now_ts()
        base["tcip_clock_drift_s"] = None
        base["tcip_nearest_support"] = base["nearest_support"]
        base["tcip_nearest_resistance"] = base["nearest_resistance"]
        return base

    def snapshot(self) -> dict:
        rng = random.Random(_seed("pnl", str(int(_now_ts() / 300))))
        return {
            "status": "ok",
            "open_positions": 1,
            "open_details": [
                {
                    "symbol": "USTEC",
                    "type": "BUY",
                    "entry_price": 29795.39,
                    "sl": 29710.39,
                    "tp": 29935.39,
                    "lot": 0.06,
                    "profit": round(rng.uniform(-2, 3), 2),
                    "current_price": _tick_price(self.symbols["USTEC"]["base"], "USTEC"),
                    "trail_level": 0,
                    "trail_label": "",
                    "profit_locked": 0.0,
                }
            ],
            "recent_signals": [
                {
                    "symbol": "TEST",
                    "timeframe": "M5",
                    "direction": "BUY",
                    "grade": "APLUS",
                    "verdict": "",
                    "unified_score": 0.0,
                    "outcome": "WIN",
                    "timestamp": _now_ts() - 420,
                }
            ],
            "engine": self.engine,
            "insight_data": self.insight_data(),
            "market_prices": self.market_prices(),
            "pnl_summary": {
                "today": {"pnl": 0.0, "trades": 0, "win_rate": 0.0},
                "week": {"pnl": -154.84, "trades": 49, "win_rate": 65.3},
                "month": {"pnl": 177.08, "trades": 108, "win_rate": 72.2},
                "daily_breakdown": [],
                "loading": False,
            },
            "ml_status": {
                "trained": True,
                "retrain_count": 24,
                "total_outcomes": 141,
                "accuracy": 0.7576,
                "pattern_rates": [
                    {"pattern": "BPLUS_SELL", "wins": 1, "losses": 0, "total": 1, "win_rate": 1.0},
                    {"pattern": "UNKNOWN", "wins": 66, "losses": 34, "total": 100, "win_rate": 0.66},
                ],
                "calibration": [
                    {"bucket": "40-49%", "total": 1, "wins": 1, "win_rate": 1.0},
                    {"bucket": "50-59%", "total": 106, "wins": 70, "win_rate": 0.6604},
                ],
                "feature_importance": [
                    {"feature": "body_ratio", "importance": 0.276},
                    {"feature": "body", "importance": 0.1421},
                    {"feature": "lag_1", "importance": 0.0773},
                ],
                "drift": {
                    "window_size": 200,
                    "current_samples": 0,
                    "win_rate": None,
                    "alert_threshold": 0.4,
                    "critical_threshold": 0.3,
                },
                "recent_alerts": [],
            },
            "pipeline_health": {
                "health_score": 0.3181,
                "signals_per_hour": 175,
                "entry_rate": 0.0631,
                "cr_rejection_rate": 0.9369,
                "baseline_arrival": 671.0,
                "baseline_entry_pct": 26.767,
                "baseline_cr_pct": 6.91,
            },
            "system_analysis": {
                "enabled": True,
                "running": True,
                "last_run_ts": _now_ts() - 540,
                "proposals_open": 131,
                "proposals_total": 296,
                "reports_total": 701,
                "latest_proposal": {
                    "title": "Correlation: all_filters_fail_rate ~ pipeline_health_score (r=-0.92)",
                    "target_loop": "cr_engine",
                    "status": "pending",
                    "priority": 2,
                },
                "collectors": {
                    "pipeline": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "ai": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "cr_engine": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "filter": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "safety": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "trade": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "db": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "mt5": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "system": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "signal_pipeline": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "outcome_quality": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "gating_effectiveness": {"emits": 1, "last_emit_age_s": 539.6, "last_error": None},
                    "counterfactual": {"emits": 1, "last_emit_age_s": 539.5, "last_error": None},
                },
            },
            "eco_cal": {
                "blocked": False,
                "next_events": [
                    {
                        "name": "GDP m/m",
                        "timestamp": _now_ts() + 8700,
                        "currency": "GBP",
                        "impact": "HIGH",
                        "is_high": True,
                        "is_speech": False,
                        "time_utc": "06:00",
                        "minutes_away": 145,
                        "event": "GDP m/m",
                    },
                    {
                        "name": "PPI m/m",
                        "timestamp": _now_ts() + 10500,
                        "currency": "CHF",
                        "impact": "HIGH",
                        "is_high": True,
                        "is_speech": False,
                        "time_utc": "06:30",
                        "minutes_away": 175,
                        "event": "PPI m/m",
                    },
                ],
            },
            "rejection_counters": {"sr_proximity": 0, "ai_buffered_skip": 12, "signal_filter": 19, "phase_gate": 0},
            "rejection_reasons": {
                "signal_filter": "Bar opposes signal direction - candle fights trade",
                "ai_buffered_skip": "confidence 0 < 75 (CHOP)",
            },
            "fast_path_gate_rejections": {"bar_opposing": 0, "counter_trend": 0, "rsi_extreme": 0},
            "cr_engine_stats": {
                "total_processed": 175,
                "total_rejected": 0,
                "total_tradeable": 92,
                "by_verdict": {
                    "MODERATE": 63,
                    "LOW": 77,
                    "CAUTION": 6,
                    "MAX_CONVICTION": 16,
                    "HIGH_CONFIDENCE": 13,
                },
                "by_reject_reason": {},
                "tcip_cache_evictions": 0,
                "config": {
                    "tcip_weight": 0.35,
                    "key_level_weight": 0.08,
                    "candle_weight": 0.1,
                    "bar_strength_weight": 0.03,
                    "session_weight": 0.04,
                    "atr_weight": 0.05,
                    "history_weight": 0.03,
                    "ml_weight": 0.25,
                },
                "layer_performance": {},
                "last_layer_health": {
                    "tcip": {"status": "ok", "score": 42.8, "weight": 0.35, "status_history": ["ok"] * 8, "streak_started": None},
                    "bar": {"status": "ok", "score": 65, "weight": 0.03, "status_history": ["ok"] * 8, "streak_started": None},
                    "key_level": {"status": "ok", "score": 62.0, "weight": 0.08, "status_history": ["ok"] * 8, "streak_started": None},
                    "candle": {"status": "ok", "score": 60.0, "weight": 0.1, "status_history": ["ok"] * 8, "streak_started": None},
                    "session": {"status": "ok", "score": 43.0, "weight": 0.04, "status_history": ["ok"] * 8, "streak_started": None},
                    "atr": {"status": "ok", "score": 65.0, "weight": 0.05, "status_history": ["ok"] * 8, "streak_started": None},
                    "history": {"status": "ok", "score": 50.0, "weight": 0.03, "status_history": ["ok"] * 8, "streak_started": None},
                    "ml": {"status": "ok", "score": 39.5, "weight": 0.25, "status_history": ["ok"] * 8, "streak_started": None},
                },
                "last_pool_healthy": True,
                "layer_alert_streaks": {},
                "layer_alerted": [],
                "layer_alert_threshold": 3,
                "layer_alert_cooldown_s": 900,
                "layer_last_event_ts": {},
                "layer_cooldown_remaining": {},
            },
            "db_health": {
                "db_health_available": True,
                "checks_total": 2,
                "checks_valid": 2,
                "corrupt_count": 0,
                "corrupt_keys": [],
                "prefixes": {
                    "trade_meta": {"total": 1, "valid": 1, "corrupt": 0},
                    "trail_state": {"total": 1, "valid": 1, "corrupt": 0},
                },
                "tables": {
                    "signal_rejections": {"ok": True, "rows": 13257},
                    "tcip_signal_log": {"ok": True, "rows": 19590, "latest_age_s": 5.0},
                },
                "last_verified": _now_ts() - 1,
                "cached": True,
                "last_signal_age_s": 5.0,
            },
            "ai_analyzing": False,
            "feed_pool_queue_depth": 0,
            "mt5_queue_depth": 0,
            "pnl_cache_age": 59.6,
            "pnl_cache_server_time": _iso(),
        }


state = KSynthState()
