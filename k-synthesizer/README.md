# K-Synthesizer Reconstruction

Platform dashboard analisis sinyal trading berbasis AI — rekonstruksi `tcip.asia`
yang divalidasi terhadap kontrak API asli (bukan asumsi generik).

Kontrak lengkap: [docs/K-SYNTH-API.md](docs/K-SYNTH-API.md)

## Arsitektur

- `apps/web` — Next.js single-page dashboard (kartu SIGNAL, MARKET, ML, P&L, ECO, PIPELINE, QUEUES, REJECTIONS, SYSTEM); WS + fallback REST.
- `services/api` — FastAPI: `GET /public/dashboard`, `/public/prices`, `/public/orders`, WS `/ws` (event `{type:"tick", prices}`).
- `services/mt5-bridge` — MT5 read-only (mock default; aktif bila `MetaTrader5` terpasang).
- `services/ai-engine` — scoring layer TCIP/KEY/CNDL/SESN/ATR/ML + verdict (deterministik seeded, bobot dari `cr_engine_stats.config`).

## Quickstart

```bash
cp .env.example .env

# PostgreSQL + Redis
docker compose up -d postgres redis

# API
cd services/api && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# AI engine
cd services/ai-engine && pip install -r requirements.txt
uvicorn main:app --reload --port 8200

# MT5 bridge (Windows untuk MT5 asli)
cd services/mt5-bridge && pip install -r requirements.txt
uvicorn main:app --reload --port 8100

# Web
cd apps/web && npm install && npm run dev
```

URL: web `http://localhost:3000`, API `http://localhost:8000`,
AI `http://localhost:8200`, MT5 `http://localhost:8100`.

## Endpoint tersedia

```
GET http://localhost:8000/health
GET http://localhost:8000/public/dashboard
GET http://localhost:8000/public/prices
GET http://localhost:8000/public/orders
WS  ws://localhost:8000/ws
GET http://localhost:8200/analyze?symbol=XAUUSD
GET http://localhost:8100/status
GET http://localhost:8100/quotes?symbols=XAUUSD,USTEC
GET http://localhost:8100/candles?symbol=XAUUSD
```

## Docker semua service

```bash
docker compose up --build
```
