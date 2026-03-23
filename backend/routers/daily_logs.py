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
    # 3-9: FTS5 registration for daily_logs
    if body.comment:
        await db.execute(
            "INSERT INTO search_index (doc_type, doc_id, title, content) VALUES ('daily_log', ?, ?, ?)",
            (log_id, body.date, body.comment),
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
    # 3-9: Update FTS5 index for daily_log comment edits
    if body.comment:
        # Remove old entry and re-insert
        await db.execute(
            "DELETE FROM search_index WHERE doc_type = 'daily_log' AND doc_id = ?",
            (log_id,),
        )
        async with db.execute("SELECT date FROM daily_logs WHERE id = ?", (log_id,)) as cur:
            row = await cur.fetchone()
        date_str = row["date"] if row else ""
        await db.execute(
            "INSERT INTO search_index (doc_type, doc_id, title, content) VALUES ('daily_log', ?, ?, ?)",
            (log_id, date_str, body.comment),
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
    # 3-9: FTS5 registration for weekly_summaries
    # Remove old entry and re-insert
    await db.execute(
        "DELETE FROM search_index WHERE doc_type = 'weekly_summary' AND doc_id = ?",
        (f"{project_id}_{week_start}",),
    )
    if body.content:
        await db.execute(
            "INSERT INTO search_index (doc_type, doc_id, title, content) VALUES ('weekly_summary', ?, ?, ?)",
            (f"{project_id}_{week_start}", f"週次サマリー {week_start}", body.content),
        )
    await db.commit()
    return {"ok": True}


# 2-2: POST /api/daily-logs/{id}/llm-summary (stub)
@router.post("/api/daily-logs/{log_id}/llm-summary")
async def generate_llm_summary(
    log_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """LLM要約生成スタブ — Phase 7（LLM連携）で本実装予定"""
    async with db.execute("SELECT id FROM daily_logs WHERE id = ?", (log_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "Daily logが見つかりません")
    return {"status": "not_implemented", "message": "LLM要約生成は Phase 7 で実装予定です"}


# 2-3: POST /api/projects/{id}/weekly-summaries/{week_start}/generate (stub)
@router.post("/api/projects/{project_id}/weekly-summaries/{week_start}/generate")
async def generate_weekly_summary(
    project_id: str,
    week_start: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """LLM週次サマリー生成スタブ — Phase 7（LLM連携）で本実装予定"""
    async with db.execute("SELECT id FROM projects WHERE id = ?", (project_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "プロジェクトが見つかりません")
    return {"status": "not_implemented", "message": "LLMサマリー生成は Phase 7 で実装予定です"}
