from fastapi import APIRouter, Depends, Query
import aiosqlite

from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(
    limit: int = Query(20, le=100),
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        """SELECT id, type, title, body, link_type, link_id, read, created_at
           FROM notifications WHERE user_id = ?
           ORDER BY read ASC, created_at DESC LIMIT ?""",
        (current_user["id"], limit),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.get("/unread-count")
async def unread_count(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read = 0",
        (current_user["id"],),
    ) as cur:
        row = await cur.fetchone()
    return {"count": row["cnt"]}


@router.patch("/{notif_id}/read")
async def mark_read(
    notif_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute(
        "UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?",
        (notif_id, current_user["id"]),
    )
    await db.commit()
    return {"ok": True}


@router.post("/read-all")
async def read_all(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute(
        "UPDATE notifications SET read = 1 WHERE user_id = ?",
        (current_user["id"],),
    )
    await db.commit()
    return {"ok": True}
