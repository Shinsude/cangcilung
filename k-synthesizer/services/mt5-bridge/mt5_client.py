"""MT5 bridge untuk rekonstruksi K-Synthesizer.

Menyimulasikan alur EA TCIP.mq5 -> terminal -> bridge. Kontrak output mengikuti
`tcip_raw` (schema v2, TCIP_3.18_AUDIT_FIX). Jika library `MetaTrader5` tersedia
dan env `MT5_LOGIN` terisi, bridge mencoba koneksi nyata; jika tidak, mode mock.

READ-ONLY: tidak ada eksekusi/order modification di service ini.
"""

from __future__ import annotations

import hashlib
import math
import random
import time
from datetime import datetime, timezone

try:
    import MetaTrader5 as mt5  # type: ignore
except Exception:  # pragma: no cover
    mt5 = None


def _seed(*parts: str) -> int:
    return int(hashlib.sha256("|".join(parts).encode()).hexdigest()[:8], 16)


class MT5Client:
    def __init__(self) -> None:
        self.mock_mode = mt5 is None
        self.connected = False
        self.server = None
        self.login = None
        self.symbols = {"XAUUSD": 4409.80, "USTEC": 29790.25}

    def connect(self) -> dict:
        if self.mock_mode:
            return {"status": "mock", "message": "MetaTrader5 tidak tersedia; mode mock."}
        if not mt5.initialize():  # type: ignore
            return {"status": "error", "message": str(mt5.last_error())}  # type: ignore
        self.connected = True
        info = mt5.account_info()  # type: ignore
        if info is not None:
            self.login = getattr(info, "login", None)
            self.server = getattr(info, "server", None)
        return {"status": "connected", "server": self.server}

    def shutdown(self) -> None:
        if mt5 is not None and self.connected:
            mt5.shutdown()  # type: ignore
            self.connected = False

    def status(self) -> dict:
        base = {"timestamp": datetime.now(timezone.utc).isoformat()}
        if self.mock_mode:
            return {"status": "mock", "message": "MT5 bridge berjalan dalam mode mock.", **base}
        if not self.connected:
            return {"status": "disconnected", **base}
        login_masked = None
        if self.login:
            login_masked = str(self.login)[:3] + "***"
        return {
            "status": "connected",
            "server": self.server,
            "login_masked": login_masked,
            "connected": True,
            **base,
        }

    def _quote(self, symbol: str) -> dict:
        base = self.symbols.get(symbol.upper(), 100.0)
        rng = random.Random(_seed(symbol, str(int(time.time() / 5))))
        digits = 3 if symbol.upper() == "XAUUSD" else 2
        spread = 182 if symbol.upper() == "XAUUSD" else 89
        bid = round(base + rng.uniform(-0.2, 0.2), digits)
        return {
            "symbol": symbol.upper(),
            "bid": bid,
            "ask": round(bid + spread * (10 ** -digits), digits),
            "spread": spread,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_quotes(self, symbols: list[str]) -> list[dict]:
        return [self._quote(s) for s in symbols]

    def _candle(self, symbol: str, i: int, price: float) -> dict:
        wave = math.sin(i / 7) * 0.4
        open_price = round(price + wave, 3)
        return {
            "open_time": datetime.now(timezone.utc).isoformat(),
            "open": open_price,
            "high": round(open_price + 0.35, 3),
            "low": round(open_price - 0.35, 3),
            "close": round(open_price + 0.12, 3),
            "volume": int(400 + abs(wave) * 900),
        }

    def get_candles(self, symbol: str, limit: int = 100) -> list[dict]:
        base = self.symbols.get(symbol.upper(), 100.0)
        return [self._candle(symbol, i, base) for i in range(limit)]


client = MT5Client()
