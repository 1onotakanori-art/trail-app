import uuid
import json
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import aiosqlite

from database import get_db
from auth import get_current_user
from websocket import manager

router = APIRouter(prefix="/api/projects", tags=["projects"])

# 3-1: Column whitelist for projects PATCH
PROJECTS_ALLOWED_COLUMNS = {
    "name", "owner_id", "state", "feeling", "feeling_updated_at",
    "start_date", "end_date", "tags", "box_url", "box_local_path",
}


def _next_project_id(existing_ids: list[str], date_str: str) -> str:
    prefix = f"P-{date_str}-"
    nums = []
    for pid in existing_ids:
        if pid.startswith(prefix):
            try:
                nums.append(int(pid[len(prefix):]))
            except ValueError:
                pass
    n = (max(nums) + 1) if nums else 1
    return f"{prefix}{n:03d}"


class ProjectCreate(BaseModel):
    name: str
    owner_id: str
    start_date: str
    end_date: str
    tags: list[str] = []
    box_url: Optional[str] = None
    box_local_path: Optional[str] = None
    feeling: Optional[str] = "順調"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    owner_id: Optional[str] = None
    state: Optional[str] = None
    feeling: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    tags: Optional[list[str]] = None
    box_url: Optional[str] = None
    box_local_path: Optional[str] = None


class CloseRequest(BaseModel):
    close_summary: str
    close_outputs: list[dict] = []


@router.get("")
async def list_projects(
    state: Optional[str] = None,
    owner_id: Optional[str] = None,
    tag: Optional[str] = None,
    archived: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    query = """
        SELECT p.*, u.display_name as owner_name
        FROM projects p
        JOIN users u ON u.id = p.owner_id
        WHERE 1=1
    """
    params: list = []

    if state:
        query += " AND p.state = ?"
        params.append(state)
    if owner_id:
        query += " AND p.owner_id = ?"
        params.append(owner_id)
    if archived is not None:
        query += " AND p.archived = ?"
        params.append(1 if archived else 0)
    else:
        query += " AND p.archived = 0"
    if tag:
        query += " AND json_each.value = ?"
        query = query.replace("WHERE 1=1", "JOIN json_each(p.tags) WHERE 1=1")
        params.append(tag)

    query += " ORDER BY p.created_at DESC"

    async with db.execute(query, params) as cur:
        rows = await cur.fetchall()

    result = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d.get("tags") or "[]")
        d["close_outputs"] = json.loads(d.get("close_outputs") or "[]")
        result.append(d)
    return result


@router.post("", status_code=201)
async def create_project(
    body: ProjectCreate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    today = datetime.now().strftime("%Y%m%d")
    async with db.execute("SELECT id FROM projects WHERE id LIKE ?", (f"P-{today}-%",)) as cur:
        existing = [r["id"] for r in await cur.fetchall()]
    project_id = _next_project_id(existing, today)

    obsidian_folder = f"200_Projects/{today}_{body.name}"

    await db.execute(
        """INSERT INTO projects
           (id, name, owner_id, start_date, end_date, tags, box_url, box_local_path,
            obsidian_folder, feeling)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            project_id,
            body.name,
            body.owner_id,
            body.start_date,
            body.end_date,
            json.dumps(body.tags, ensure_ascii=False),
            body.box_url,
            body.box_local_path,
            obsidian_folder,
            body.feeling or "順調",
        ),
    )

    # create project channel
    channel_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO channels (id, project_id, name, type) VALUES (?, ?, ?, 'project')",
        (channel_id, project_id, body.name),
    )

    # subscribe owner and admins
    async with db.execute(
        "SELECT id FROM users WHERE id = ? OR role = 'admin'", (body.owner_id,)
    ) as cur:
        user_ids = [r["id"] for r in await cur.fetchall()]

    for uid in set(user_ids):
        await db.execute(
            "INSERT OR IGNORE INTO channel_subscriptions (channel_id, user_id) VALUES (?, ?)",
            (channel_id, uid),
        )

    # 3-8: Resolve owner_id to display_name for notification body
    async with db.execute(
        "SELECT display_name FROM users WHERE id = ?", (body.owner_id,)
    ) as cur:
        owner_row = await cur.fetchone()
    owner_display_name = owner_row["display_name"] if owner_row else body.owner_id

    # create notifications
    async with db.execute("SELECT id FROM users", ()) as cur:
        all_users = [r["id"] for r in await cur.fetchall()]

    for uid in all_users:
        notif_id = str(uuid.uuid4())
        await db.execute(
            """INSERT INTO notifications (id, user_id, type, title, body, link_type, link_id)
               VALUES (?, ?, 'project_created', ?, ?, 'project', ?)""",
            (notif_id, uid, f"新規業務: {body.name}", f"担当: {owner_display_name}", project_id),
        )

    # 3-14: Send generic notification WS event
    await manager.broadcast({"type": "notification"})

    # FTS
    await db.execute(
        "INSERT INTO search_index (doc_type, doc_id, title, content) VALUES ('project', ?, ?, ?)",
        (project_id, body.name, " ".join(body.tags)),
    )

    await db.commit()

    # broadcast
    await manager.broadcast({"type": "project_created", "project_id": project_id, "name": body.name})

    # trigger Obsidian folder creation
    try:
        from obsidian import create_project_folder
        await create_project_folder(
            project_id=project_id,
            project_name=body.name,
            owner_name=owner_display_name,
            start_date=body.start_date,
            end_date=body.end_date,
            box_url=body.box_url or "",
            box_local_path=body.box_local_path or "",
        )
    except Exception:
        pass  # Vault not configured, skip silently

    return {"id": project_id, "channel_id": channel_id}


@router.get("/{project_id}")
async def get_project(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        """SELECT p.*, u.display_name as owner_name
           FROM projects p JOIN users u ON u.id = p.owner_id
           WHERE p.id = ?""",
        (project_id,),
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "プロジェクトが見つかりません")
    d = dict(row)
    d["tags"] = json.loads(d.get("tags") or "[]")
    d["close_outputs"] = json.loads(d.get("close_outputs") or "[]")
    return d


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    updates: dict = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.owner_id is not None:
        updates["owner_id"] = body.owner_id
    if body.state is not None:
        updates["state"] = body.state
    if body.feeling is not None:
        updates["feeling"] = body.feeling
        updates["feeling_updated_at"] = datetime.now().isoformat()
    if body.start_date is not None:
        updates["start_date"] = body.start_date
    if body.end_date is not None:
        updates["end_date"] = body.end_date
    if body.tags is not None:
        updates["tags"] = json.dumps(body.tags, ensure_ascii=False)
    if body.box_url is not None:
        updates["box_url"] = body.box_url
    if body.box_local_path is not None:
        updates["box_local_path"] = body.box_local_path

    if not updates:
        raise HTTPException(400, "更新項目がありません")

    # 3-1: Verify all column names are in whitelist
    for col in updates:
        if col not in PROJECTS_ALLOWED_COLUMNS:
            raise HTTPException(400, f"不正なカラム名: {col}")

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [project_id]
    await db.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)
    await db.commit()

    await manager.broadcast({"type": "project_updated", "project_id": project_id, "updates": body.model_dump(exclude_none=True)})
    return {"ok": True}


@router.post("/{project_id}/close")
async def close_project(
    project_id: str,
    body: CloseRequest,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    now = datetime.now().isoformat()
    await db.execute(
        """UPDATE projects SET state = '完了', archived = 1, close_summary = ?,
           close_outputs = ?, closed_at = ? WHERE id = ?""",
        (
            body.close_summary,
            json.dumps(body.close_outputs, ensure_ascii=False),
            now,
            project_id,
        ),
    )
    await db.commit()

    # update Obsidian star file
    try:
        from obsidian import update_project_close
        async with db.execute(
            "SELECT name, obsidian_folder, close_summary, close_outputs FROM projects WHERE id = ?",
            (project_id,),
        ) as cur:
            row = await cur.fetchone()
        if row:
            await update_project_close(
                obsidian_folder=row["obsidian_folder"],
                project_name=row["name"],
                close_summary=body.close_summary,
                close_outputs=body.close_outputs,
                closed_at=now,
            )
    except Exception:
        pass

    await manager.broadcast({"type": "project_updated", "project_id": project_id, "state": "完了"})
    return {"ok": True}
