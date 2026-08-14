import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.state import state

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            payload = {"type": "tick", "prices": state.market_prices()}
            await websocket.send_json(payload)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
