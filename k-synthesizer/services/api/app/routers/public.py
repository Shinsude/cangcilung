from fastapi import APIRouter

from app.core.state import state

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/dashboard")
def dashboard() -> dict:
    return state.snapshot()


@router.get("/prices")
def prices() -> dict:
    return {"prices": state.market_prices()}


@router.get("/orders")
def orders() -> dict:
    return {"orders": []}
