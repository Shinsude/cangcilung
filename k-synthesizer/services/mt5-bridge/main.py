from contextlib import asynccontextmanager

from fastapi import FastAPI, Query

from mt5_client import client


@asynccontextmanager
async def lifespan(app: FastAPI):
    client.connect()
    yield
    client.shutdown()


app = FastAPI(title="K-Synthesizer MT5 Bridge", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "mt5-bridge", "mock_mode": client.mock_mode}


@app.get("/status")
def status() -> dict:
    return client.status()


@app.get("/quotes")
def quotes(symbols: str = Query(default="XAUUSD,USTEC")) -> dict:
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return {
        "quotes": client.get_quotes(symbol_list),
        "source": "mock" if client.mock_mode else "mt5",
    }


@app.get("/candles")
def candles(
    symbol: str = Query(default="XAUUSD"),
    timeframe: str = Query(default="M15"),
    limit: int = Query(default=100, le=1000),
) -> dict:
    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "candles": client.get_candles(symbol=symbol, limit=limit),
        "source": "mock" if client.mock_mode else "mt5",
    }
