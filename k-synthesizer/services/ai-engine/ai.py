"""AI scoring engine rekonstruksi K-Synthesizer.

Skor dibangun dari bobot layer nyata (cr_engine_stats.config) dan aturan
deterministik seeded — bukan random bebas. Output kontrak mengikuti
`insight_data` (radar TCIP/KEY/CNDL/SESN/ATR/ML + verdict).
"""

from __future__ import annotations

import hashlib
import math
import random

LAYER_WEIGHTS = {
    "tcip": 0.35,
    "key_level": 0.08,
    "candle": 0.10,
    "bar": 0.03,
    "session": 0.04,
    "atr": 0.05,
    "history": 0.03,
    "ml": 0.25,
}


def seed_from(symbol: str, timeframe: str) -> int:
    return int(hashlib.sha256(f"{symbol}:{timeframe}".encode()).hexdigest()[:8], 16)


def generate_features(symbol: str, timeframe: str = "M15") -> dict:
    rng = random.Random(seed_from(symbol, timeframe))
    rsi = round(rng.uniform(30, 75), 2)
    atr_pct = rng.randint(10, 95)
    spread_pct = rng.randint(5, 95)
    ema_trend = rng.choice(["BULLISH", "BEARISH", "SIDEWAYS"])
    momentum = rng.choice(["POSITIVE", "NEGATIVE", "NEUTRAL"])
    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "rsi": rsi,
        "atr_percentile": atr_pct,
        "spread_percentile": spread_pct,
        "ema_trend": ema_trend,
        "momentum": momentum,
    }


def _layer_scores(features: dict) -> dict:
    rng = random.Random(seed_from(features["symbol"], features["timeframe"]) + 7)
    f = features
    tcip = round(38 + f["atr_percentile"] * 0.25 + rng.uniform(-8, 8), 1)
    key_level = round(50 + (f["rsi"] - 45) * 0.5 + rng.uniform(-10, 10), 1)
    candle = round(52 + (12 if f["momentum"] != "NEUTRAL" else 0) + rng.uniform(-12, 12), 1)
    session = round(43 + rng.uniform(-8, 8), 1)
    atr = round(min(95, 30 + f["atr_percentile"] * 0.6), 1)
    ml = round(40 + (10 if f["ema_trend"] == "SIDEWAYS" else 0) + rng.uniform(-6, 6), 1)
    bar = round(50 + rng.uniform(-15, 15), 1)
    return {
        "tcip": max(0, min(100, tcip)),
        "key_level": max(0, min(100, key_level)),
        "candle": max(0, min(100, candle)),
        "session": max(0, min(100, session)),
        "atr": max(0, min(100, atr)),
        "ml": max(0, min(100, ml)),
        "bar": max(0, min(100, bar)),
    }


def calculate_score(features: dict) -> dict:
    layers = _layer_scores(features)
    composite = round(
        layers["tcip"] * LAYER_WEIGHTS["tcip"]
        + layers["key_level"] * LAYER_WEIGHTS["key_level"]
        + layers["candle"] * LAYER_WEIGHTS["candle"]
        + layers["bar"] * LAYER_WEIGHTS["bar"]
        + layers["session"] * LAYER_WEIGHTS["session"]
        + layers["atr"] * LAYER_WEIGHTS["atr"]
        + layers["ml"] * LAYER_WEIGHTS["ml"]
        + 50 * LAYER_WEIGHTS["history"],
        1,
    )
    confidence = int(max(0, min(100, round(composite * 1.25))))

    grade = "APLUS" if composite >= 65 else "BPLUS" if composite >= 50 else "NEUTRAL"
    verdict = "REJECT" if composite < 50 else "ACCEPT"
    risk = "LOW" if grade == "APLUS" else "MODERATE"

    regime = "TACTICAL NEUTRAL"
    decomp = "CHOP"
    if features["atr_percentile"] > 80:
        regime = "HIGH VOLATILITY"
        decomp = "TREND"
    elif features["ema_trend"] != "SIDEWAYS":
        regime = "TRENDING"
        decomp = "TREND"

    return {
        "layers": layers,
        "composite_score": composite,
        "confidence": confidence,
        "confidence_raw": round(composite * 1.25, 2),
        "grade": grade,
        "verdict": verdict,
        "risk_level": risk,
        "regime": regime,
        "decomp_regime": decomp,
    }


def build_insight(symbol: str, features: dict, score: dict) -> dict:
    s = score
    direction = "BUY" if features["momentum"] == "POSITIVE" else "SELL" if features["momentum"] == "NEGATIVE" else "NEUTRAL"
    price = 4409.80 if symbol.upper() == "XAUUSD" else 29790.25
    atr = round(5.5 + features["atr_percentile"] * 0.03, 2)

    parts = [f"{symbol} kondisi {s['regime'].lower()} ({s['decomp_regime']})."]
    parts.append(f"Struktur EMA {features['ema_trend'].lower()}, momentum {features['momentum'].lower()}.")
    if features["rsi"] > 70:
        parts.append("RSI tinggi, waspadai overbought.")
    elif features["rsi"] < 35:
        parts.append("RSI rendah, belum tentu reversal.")
    if features["atr_percentile"] > 80:
        parts.append("Volatilitas tinggi.")
    if features["spread_percentile"] > 80:
        parts.append("Spread relatif lebar, perhatikan biaya eksekusi.")

    recommendation = "REDUCE_RISK" if s["risk_level"] == "MODERATE" and s["verdict"] == "ACCEPT" else "WATCH" if s["verdict"] == "ACCEPT" else "NO_TRADE_ZONE"

    return {
        "symbol": symbol.upper(),
        "timeframe": features["timeframe"],
        "direction": direction,
        "grade": s["grade"],
        "verdict": s["verdict"],
        "risk_level": s["risk_level"],
        "confidence": s["confidence"],
        "composite_score": s["composite_score"],
        "market_regime": s["regime"],
        "risk_score": int(100 - s["composite_score"]),
        "summary": " ".join(parts),
        "recommendation": recommendation,
        "atr": atr,
        "suggested_sl_pips": round(atr * 1.5, 1),
        "suggested_tp_pips": round(atr * 3.0, 1),
        "risk_reward": 2.0,
        "current_price": price,
        "features": features,
        "layer_scores": s["layers"],
        "disclaimer": "Insight bersifat informatif dan bukan nasihat keuangan.",
    }
