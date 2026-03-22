import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, get_db
from auth import get_password_hash
from routers import auth, users
import aiosqlite
from config import settings


async def seed_admin():
    """Create default admin user if none exists."""
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
    yield


app = FastAPI(title="TRAIL API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "TRAIL"}
