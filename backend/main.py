import uuid
import logging
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

logger = logging.getLogger(__name__)


async def seed_admin():
    """3-17: Create default admin with warning. In production, set TRAIL_DISABLE_SEED_ADMIN=1."""
    import os
    if os.environ.get("TRAIL_DISABLE_SEED_ADMIN"):
        return

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
            print("⚠️  デフォルト管理者を作成しました: admin / admin（本番環境では必ずパスワードを変更してください）")


# 3-18: Daily cron for stale project detection
async def _daily_cron():
    """Check for stale projects and generate follow_alert notifications."""
    import asyncio
    from datetime import date, timedelta
    while True:
        try:
            await asyncio.sleep(86400)  # 24 hours
            two_days_ago = (date.today() - timedelta(days=2)).isoformat()
            async with aiosqlite.connect(settings.database_url) as db:
                db.row_factory = aiosqlite.Row
                async with db.execute(
                    """
                    SELECT p.id, p.name, p.owner_id, u.display_name as owner_name,
                           MAX(dl.date) as last_note_date
                    FROM projects p
                    JOIN users u ON u.id = p.owner_id
                    LEFT JOIN daily_logs dl ON dl.project_id = p.id AND dl.obsidian_note_path IS NOT NULL
                    WHERE p.archived = 0 AND p.state = '進行中'
                    GROUP BY p.id
                    HAVING last_note_date IS NULL OR last_note_date < ?
                    """,
                    (two_days_ago,),
                ) as cur:
                    stale = [dict(r) for r in await cur.fetchall()]

                if stale:
                    # Get admin users
                    async with db.execute("SELECT id FROM users WHERE role = 'admin'") as cur:
                        admins = [r["id"] for r in await cur.fetchall()]

                    for proj in stale:
                        for admin_id in admins:
                            notif_id = str(uuid.uuid4())
                            await db.execute(
                                """INSERT INTO notifications (id, user_id, type, title, body, link_type, link_id)
                                   VALUES (?, ?, 'follow_alert', ?, ?, 'project', ?)""",
                                (
                                    notif_id,
                                    admin_id,
                                    f"フォローアラート: {proj['name']}",
                                    f"2日以上note更新なし（担当: {proj['owner_name']}）",
                                    proj["id"],
                                ),
                            )
                    await db.commit()

                    # 3-13: Send follow_alert WS event to admins
                    for admin_id in admins:
                        await manager.send_to_user(admin_id, {"type": "follow_alert", "count": len(stale)})
                    # 3-14: Send generic notification event
                    await manager.broadcast({"type": "notification"})

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Daily cron error: {e}")
            await asyncio.sleep(3600)  # retry in 1 hour


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

    # 3-18: Start daily cron task
    import asyncio
    cron_task = asyncio.create_task(_daily_cron())

    yield

    cron_task.cancel()
    try:
        await cron_task
    except asyncio.CancelledError:
        pass


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
            # 3-15: Include reason in close message
            await websocket.close(code=4001, reason="トークンにユーザーIDが含まれていません")
            return
    except JWTError:
        # 3-15: Include reason in close message
        await websocket.close(code=4001, reason="認証トークンが無効です")
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
