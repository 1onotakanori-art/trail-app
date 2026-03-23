import uuid
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import aiosqlite

from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/channels", tags=["channels"])


class BookmarkUpdate(BaseModel):
    bookmarked: bool


@router.get("")
async def list_channels(
    sort: str = Query("updated", pattern="^(updated|created|bookmarked|unread)$"),
    bookmarked_only: bool = False,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    user_id = current_user["id"]

    base_query = """
        SELECT
            c.id, c.project_id, c.name, c.type, c.created_at,
            cs.bookmarked,
            cs.subscribed_at,
            (SELECT content FROM messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
            (SELECT created_at FROM messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
            (SELECT COUNT(*) FROM messages m
             LEFT JOIN (SELECT MAX(created_at) as read_at FROM messages WHERE channel_id = c.id) r ON 1=1
             WHERE m.channel_id = c.id AND m.user_id != ? AND m.created_at > COALESCE(r.read_at, '')) as unread_count
        FROM channels c
        LEFT JOIN channel_subscriptions cs ON cs.channel_id = c.id AND cs.user_id = ?
        WHERE c.type = 'general' OR cs.channel_id IS NOT NULL
    """
    params: list = [user_id, user_id]

    if bookmarked_only:
        base_query += " AND cs.bookmarked = 1"

    if sort == "updated":
        base_query += " ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC"
    elif sort == "created":
        base_query += " ORDER BY c.created_at DESC"
    elif sort == "bookmarked":
        base_query += " ORDER BY cs.bookmarked DESC, last_message_at DESC NULLS LAST"
    elif sort == "unread":
        base_query += " ORDER BY unread_count DESC, last_message_at DESC NULLS LAST"

    async with db.execute(base_query, params) as cursor:
        rows = await cursor.fetchall()

    return [dict(r) for r in rows]


@router.post("/{channel_id}/subscribe", status_code=201)
async def subscribe(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    sub_id = str(uuid.uuid4())
    await db.execute(
        """INSERT OR IGNORE INTO channel_subscriptions (channel_id, user_id)
           VALUES (?, ?)""",
        (channel_id, current_user["id"]),
    )
    await db.commit()
    return {"ok": True}


@router.delete("/{channel_id}/subscribe")
async def unsubscribe(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute(
        "DELETE FROM channel_subscriptions WHERE channel_id = ? AND user_id = ?",
        (channel_id, current_user["id"]),
    )
    await db.commit()
    return {"ok": True}


@router.patch("/{channel_id}/bookmark")
async def toggle_bookmark(
    channel_id: str,
    body: BookmarkUpdate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute(
        """INSERT INTO channel_subscriptions (channel_id, user_id, bookmarked)
           VALUES (?, ?, ?)
           ON CONFLICT(channel_id, user_id) DO UPDATE SET bookmarked = excluded.bookmarked""",
        (channel_id, current_user["id"], 1 if body.bookmarked else 0),
    )
    await db.commit()
    return {"ok": True}
