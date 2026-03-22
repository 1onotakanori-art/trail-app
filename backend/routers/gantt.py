import json
from typing import Optional
from fastapi import APIRouter, Depends, Query
import aiosqlite

from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/gantt", tags=["gantt"])


@router.get("")
async def get_gantt(
    owner_id: Optional[str] = None,
    tag: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """全体ガントデータ: projects + tasks + milestones + daily_logs"""
    query = """
        SELECT p.id, p.name, p.owner_id, p.state, p.feeling,
               p.start_date, p.end_date, p.tags, p.obsidian_folder,
               u.display_name as owner_name
        FROM projects p
        JOIN users u ON u.id = p.owner_id
        WHERE p.archived = 0
    """
    params: list = []
    if owner_id:
        query += " AND p.owner_id = ?"
        params.append(owner_id)
    if date_from:
        query += " AND p.end_date >= ?"
        params.append(date_from)
    if date_to:
        query += " AND p.start_date <= ?"
        params.append(date_to)
    query += " ORDER BY p.created_at"

    async with db.execute(query, params) as cur:
        projects = [dict(r) for r in await cur.fetchall()]

    if tag:
        projects = [p for p in projects if tag in json.loads(p.get("tags") or "[]")]

    for p in projects:
        p["tags"] = json.loads(p.get("tags") or "[]")
        pid = p["id"]

        # tasks
        async with db.execute(
            "SELECT * FROM tasks WHERE project_id = ? ORDER BY sort_order, created_at",
            (pid,),
        ) as cur:
            p["tasks"] = [dict(r) for r in await cur.fetchall()]

        # daily progress per task
        for task in p["tasks"]:
            async with db.execute(
                "SELECT date, progress FROM task_daily_progress WHERE task_id = ?",
                (task["id"],),
            ) as cur:
                task["daily_progress"] = {r["date"]: r["progress"] for r in await cur.fetchall()}

        # milestones
        async with db.execute(
            "SELECT * FROM milestones WHERE project_id = ? ORDER BY date",
            (pid,),
        ) as cur:
            p["milestones"] = [dict(r) for r in await cur.fetchall()]

        # dependencies
        async with db.execute(
            """SELECT td.* FROM task_dependencies td
               JOIN tasks t ON t.id = td.predecessor_id
               WHERE t.project_id = ?""",
            (pid,),
        ) as cur:
            p["dependencies"] = [dict(r) for r in await cur.fetchall()]

        # daily_logs (note dots)
        async with db.execute(
            "SELECT date, obsidian_note_path, obsidian_uri, comment FROM daily_logs WHERE project_id = ? ORDER BY date",
            (pid,),
        ) as cur:
            p["daily_logs"] = [dict(r) for r in await cur.fetchall()]

    return projects


@router.get("/daily/{project_id}/{date}")
async def get_daily(
    project_id: str,
    date: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """特定日のdaily_log + note情報"""
    async with db.execute(
        "SELECT * FROM daily_logs WHERE project_id = ? AND date = ? ORDER BY created_at",
        (project_id, date),
    ) as cur:
        logs = [dict(r) for r in await cur.fetchall()]
    return logs
