import uuid
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import aiosqlite

from database import get_db
from auth import get_current_user
from websocket import manager

router = APIRouter(tags=["messages"])


class MessageCreate(BaseModel):
    content: str
    tag: Optional[str] = None
    mentions: list[str] = []
    obsidian_links: list[dict] = []


class ReactionToggle(BaseModel):
    emoji: str


@router.get("/api/channels/{channel_id}/messages")
async def list_messages(
    channel_id: str,
    limit: int = Query(50, le=200),
    before: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    query = """
        SELECT m.id, m.channel_id, m.user_id, m.content, m.tag,
               m.mentions, m.reactions, m.obsidian_links, m.created_at,
               u.display_name, u.username
        FROM messages m
        JOIN users u ON u.id = m.user_id
        WHERE m.channel_id = ?
    """
    params: list = [channel_id]
    if before:
        query += " AND m.created_at < ?"
        params.append(before)
    query += " ORDER BY m.created_at DESC LIMIT ?"
    params.append(limit)

    async with db.execute(query, params) as cursor:
        rows = await cursor.fetchall()

    result = []
    for r in reversed(rows):
        d = dict(r)
        d["mentions"] = json.loads(d["mentions"] or "[]")
        d["reactions"] = json.loads(d["reactions"] or "{}")
        d["obsidian_links"] = json.loads(d["obsidian_links"] or "[]")
        result.append(d)
    return result


@router.post("/api/channels/{channel_id}/messages", status_code=201)
async def post_message(
    channel_id: str,
    body: MessageCreate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    # validate channel exists
    async with db.execute("SELECT id FROM channels WHERE id = ?", (channel_id,)) as cur:
        if not await cur.fetchone():
            raise HTTPException(404, "チャンネルが見つかりません")

    msg_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO messages (id, channel_id, user_id, content, tag, mentions, obsidian_links)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            msg_id,
            channel_id,
            current_user["id"],
            body.content,
            body.tag,
            json.dumps(body.mentions, ensure_ascii=False),
            json.dumps(body.obsidian_links, ensure_ascii=False),
        ),
    )

    # FTS index
    await db.execute(
        "INSERT INTO search_index (doc_type, doc_id, title, content) VALUES ('message', ?, ?, ?)",
        (msg_id, "", body.content),
    )

    # create notifications for mentions
    for mentioned_uid in body.mentions:
        notif_id = str(uuid.uuid4())
        await db.execute(
            """INSERT INTO notifications (id, user_id, type, title, body, link_type, link_id)
               VALUES (?, ?, 'mention', ?, ?, 'channel', ?)""",
            (
                notif_id,
                mentioned_uid,
                f"@メンション: {current_user['display_name']}",
                body.content[:100],
                channel_id,
            ),
        )

    await db.commit()

    # notify subscribers via WebSocket
    msg_data = {
        "type": "new_message",
        "message": {
            "id": msg_id,
            "channel_id": channel_id,
            "user_id": current_user["id"],
            "display_name": current_user["display_name"],
            "content": body.content,
            "tag": body.tag,
            "mentions": body.mentions,
            "reactions": {},
            "obsidian_links": body.obsidian_links,
            "created_at": "",
        },
    }

    # get subscribers
    async with db.execute(
        "SELECT user_id FROM channel_subscriptions WHERE channel_id = ?", (channel_id,)
    ) as cur:
        subs = [r["user_id"] for r in await cur.fetchall()]

    await manager.broadcast_to_users(subs, msg_data)

    # mention notifications via WS
    for uid in body.mentions:
        await manager.send_to_user(uid, {"type": "mention", "channel_id": channel_id})

    return {"id": msg_id}


@router.post("/api/messages/{message_id}/reactions")
async def toggle_reaction(
    message_id: str,
    body: ReactionToggle,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT reactions, channel_id FROM messages WHERE id = ?", (message_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "メッセージが見つかりません")

    reactions = json.loads(row["reactions"] or "{}")
    emoji = body.emoji
    uid = current_user["id"]

    if emoji not in reactions:
        reactions[emoji] = []
    if uid in reactions[emoji]:
        reactions[emoji].remove(uid)
        if not reactions[emoji]:
            del reactions[emoji]
    else:
        reactions[emoji].append(uid)

    await db.execute(
        "UPDATE messages SET reactions = ? WHERE id = ?",
        (json.dumps(reactions, ensure_ascii=False), message_id),
    )
    await db.commit()

    # broadcast reaction update
    await manager.broadcast(
        {
            "type": "reaction",
            "message_id": message_id,
            "channel_id": row["channel_id"],
            "reactions": reactions,
        }
    )
    return reactions
