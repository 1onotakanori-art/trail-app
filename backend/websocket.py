import asyncio
from typing import Dict, Set
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # user_id -> set of websockets
        self.connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.connections:
            self.connections[user_id] = set()
        self.connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.connections:
            self.connections[user_id].discard(websocket)
            if not self.connections[user_id]:
                del self.connections[user_id]

    async def send_to_user(self, user_id: str, data: dict):
        if user_id in self.connections:
            dead = set()
            for ws in self.connections[user_id]:
                try:
                    await ws.send_json(data)
                except Exception:
                    dead.add(ws)
            for ws in dead:
                self.connections[user_id].discard(ws)

    async def broadcast(self, data: dict, exclude_user: str | None = None):
        for user_id, sockets in list(self.connections.items()):
            if user_id == exclude_user:
                continue
            dead = set()
            for ws in sockets:
                try:
                    await ws.send_json(data)
                except Exception:
                    dead.add(ws)
            for ws in dead:
                self.connections[user_id].discard(ws)

    async def broadcast_to_users(self, user_ids: list[str], data: dict):
        for uid in user_ids:
            await self.send_to_user(uid, data)


manager = ConnectionManager()
