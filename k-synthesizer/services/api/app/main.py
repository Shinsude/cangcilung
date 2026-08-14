from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import health, public, ws

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Backend API untuk rekonstruksi K-Synthesizer / tcip.asia",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(public.router)
app.include_router(ws.router)
