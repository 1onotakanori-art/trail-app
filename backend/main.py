import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt

from config import settings
from database import init_db, get_db
from auth import get_password_hash, ALGORITHM
from websocket import manager
from routers import auth, users, channels, messages, notifications
from routers import projects, tasks, milestones, gantt, daily_logs, vault, search, dashboard
import aiosqlite


async def seed_admin():
    async with aiosqlite.connect(settings.database_url) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1") as cur:
            row = await cur.fetchone()
        if row is None:
            admin_id = str(uuid.uuid4())
            hashed = get_password_hash("admin")
            await db.execute(
                "INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)",
                (admin_id, "admin", hashed, "管理者", "admin"),
            )
            await db.commit()
            print("✅ デフォルト管理者を作成しました: admin / admin")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_admin()
    # start vault watcher
    try:
        from obsidian import start_watcher
        await start_watcher(settings.database_url)
    except Exception as e:
        print(f"⚠️  Vault watcher 起動失敗: {e}")
    yield


app = FastAPI(title="TRAIL API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(channels.router)
app.include_router(messages.router)
app.include_router(notifications.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(milestones.router)
app.include_router(gantt.router)
app.include_router(daily_logs.router)
app.include_router(vault.router)
app.include_router(search.router)
app.include_router(dashboard.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "TRAIL"}


# ── WebSocket ─────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    # authenticate
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_json()
            # client can send ping
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception:
        manager.disconnect(websocket, user_id)
