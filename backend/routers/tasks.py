import uuid
import json
from typing import Optional
from datetime import date as date_type, datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import aiosqlite

from database import get_db
from auth import get_current_user
from websocket import manager

router = APIRouter(tags=["tasks"])


class TaskCreate(BaseModel):
    title: str
    planned_start: str
    planned_end: str
    sort_order: int = 0


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    planned_start: Optional[str] = None
    planned_end: Optional[str] = None
    status: Optional[str] = None
    sort_order: Optional[int] = None


class TaskReorder(BaseModel):
    task_ids: list[str]


class DependencyCreate(BaseModel):
    predecessor_id: str
    successor_id: str
    dep_type: str = "FS"


class ProgressSet(BaseModel):
    progress: int


# ── Tasks ──────────────────────────────────────────────────────────────────

@router.get("/api/projects/{project_id}/tasks")
async def list_tasks(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order, created_at",
        (project_id,),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.post("/api/projects/{project_id}/tasks", status_code=201)
async def create_task(
    project_id: str,
    body: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    task_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO tasks (id, project_id, title, planned_start, planned_end, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (task_id, project_id, body.title, body.planned_start, body.planned_end, body.sort_order),
    )
    await db.commit()
    return {"id": task_id}


@router.patch("/api/tasks/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "タスクが見つかりません")

    updates: dict = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.planned_start is not None:
        updates["planned_start"] = body.planned_start
    if body.planned_end is not None:
        updates["planned_end"] = body.planned_end
    if body.sort_order is not None:
        updates["sort_order"] = body.sort_order
    if body.status is not None:
        updates["status"] = body.status
        today = datetime.now().date().isoformat()
        if body.status == "進行中" and not row["actual_start"]:
            updates["actual_start"] = today
        elif body.status == "完了" and not row["actual_end"]:
            updates["actual_end"] = today

    if not updates:
        raise HTTPException(400, "更新項目がありません")

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [task_id]
    await db.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", values)
    await db.commit()

    await manager.broadcast({"type": "progress_updated", "task_id": task_id})
    return {"ok": True}


@router.delete("/api/tasks/{task_id}")
async def delete_task(
    task_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    await db.commit()
    return {"ok": True}


@router.patch("/api/projects/{project_id}/tasks/reorder")
async def reorder_tasks(
    project_id: str,
    body: TaskReorder,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    for i, task_id in enumerate(body.task_ids):
        await db.execute(
            "UPDATE tasks SET sort_order = ? WHERE id = ? AND project_id = ?",
            (i, task_id, project_id),
        )
    await db.commit()
    return {"ok": True}


# ── Dependencies ───────────────────────────────────────────────────────────

@router.get("/api/projects/{project_id}/dependencies")
async def list_dependencies(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        """SELECT td.* FROM task_dependencies td
           JOIN tasks t ON t.id = td.predecessor_id
           WHERE t.project_id = ?""",
        (project_id,),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.post("/api/dependencies", status_code=201)
async def create_dependency(
    body: DependencyCreate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    dep_id = str(uuid.uuid4())
    try:
        await db.execute(
            "INSERT INTO task_dependencies (id, predecessor_id, successor_id, dep_type) VALUES (?, ?, ?, ?)",
            (dep_id, body.predecessor_id, body.successor_id, body.dep_type),
        )
        await db.commit()
    except Exception:
        raise HTTPException(400, "依存関係の作成に失敗しました（循環依存の可能性）")

    await manager.broadcast({"type": "dependency_changed", "action": "created", "dep_id": dep_id})
    return {"id": dep_id}


@router.delete("/api/dependencies/{dep_id}")
async def delete_dependency(
    dep_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute("DELETE FROM task_dependencies WHERE id = ?", (dep_id,))
    await db.commit()
    await manager.broadcast({"type": "dependency_changed", "action": "deleted", "dep_id": dep_id})
    return {"ok": True}


# ── Daily Progress ─────────────────────────────────────────────────────────

@router.get("/api/tasks/{task_id}/progress")
async def get_progress(
    task_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT date, progress FROM task_daily_progress WHERE task_id = ? ORDER BY date",
        (task_id,),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.put("/api/tasks/{task_id}/progress/{date}")
async def set_progress(
    task_id: str,
    date: str,
    body: ProgressSet,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if body.progress not in (0, 20, 40, 60, 80, 100):
        raise HTTPException(400, "進捗度は0/20/40/60/80/100のいずれかです")

    rec_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO task_daily_progress (id, task_id, date, progress) VALUES (?, ?, ?, ?)
           ON CONFLICT(task_id, date) DO UPDATE SET progress = excluded.progress""",
        (rec_id, task_id, date, body.progress),
    )
    await db.commit()

    await manager.broadcast({"type": "progress_updated", "task_id": task_id, "date": date, "progress": body.progress})
    return {"ok": True}
