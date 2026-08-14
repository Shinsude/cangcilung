from fastapi import FastAPI, Query

from ai import build_insight, calculate_score, generate_features

app = FastAPI(title="K-Synthesizer AI Engine", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ai-engine"}


@app.get("/analyze")
def analyze(
    symbol: str = Query(default="XAUUSD"),
    timeframe: str = Query(default="M15"),
) -> dict:
    symbol = symbol.upper()
    features = generate_features(symbol=symbol, timeframe=timeframe)
    score = calculate_score(features)
    return build_insight(symbol=symbol, features=features, score=score)
