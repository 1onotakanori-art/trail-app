import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import aiosqlite

from database import get_db
from auth import get_current_user

router = APIRouter(tags=["daily_logs"])


class DailyLogCreate(BaseModel):
    date: str
    comment: Optional[str] = None
    obsidian_note_path: Optional[str] = None


class DailyLogUpdate(BaseModel):
    comment: Optional[str] = None


class WeeklySummaryUpsert(BaseModel):
    content: str
    source: str = "manual"


@router.get("/api/projects/{project_id}/daily-logs")
async def list_daily_logs(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT * FROM daily_logs WHERE project_id = ? ORDER BY date DESC",
        (project_id,),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.post("/api/projects/{project_id}/daily-logs", status_code=201)
async def create_daily_log(
    project_id: str,
    body: DailyLogCreate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    log_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO daily_logs (id, project_id, date, comment, obsidian_note_path, source)
           VALUES (?, ?, ?, ?, ?, 'manual')""",
        (log_id, project_id, body.date, body.comment, body.obsidian_note_path),
    )
    await db.commit()
    return {"id": log_id}


@router.patch("/api/daily-logs/{log_id}")
async def update_daily_log(
    log_id: str,
    body: DailyLogUpdate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute(
        "UPDATE daily_logs SET comment = ? WHERE id = ?",
        (body.comment, log_id),
    )
    await db.commit()
    return {"ok": True}


@router.get("/api/projects/{project_id}/weekly-summaries")
async def list_weekly_summaries(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT * FROM weekly_summaries WHERE project_id = ? ORDER BY week_start",
        (project_id,),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.put("/api/projects/{project_id}/weekly-summaries/{week_start}")
async def upsert_weekly_summary(
    project_id: str,
    week_start: str,
    body: WeeklySummaryUpsert,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    sid = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO weekly_summaries (id, project_id, week_start, content, source)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(project_id, week_start) DO UPDATE SET
             content = excluded.content,
             source = excluded.source,
             updated_at = datetime('now')""",
        (sid, project_id, week_start, body.content, body.source),
    )
    await db.commit()
    return {"ok": True}
