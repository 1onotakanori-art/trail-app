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


@router.post("/api/daily-logs/{log_id}/llm-summary")
async def generate_llm_summary(
    log_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """LLM要約生成: daily_logに紐づくnoteの内容から一言コメントを生成"""
    async with db.execute(
        """SELECT dl.*, p.name as project_name
           FROM daily_logs dl
           JOIN projects p ON p.id = dl.project_id
           WHERE dl.id = ?""",
        (log_id,),
    ) as cur:
        log = await cur.fetchone()
    if not log:
        raise HTTPException(404, "Daily logが見つかりません")

    # Gather note content for context
    note_content = ""
    if log["obsidian_note_path"]:
        try:
            from obsidian import get_projects_path
            note_file = get_projects_path() / log["obsidian_note_path"]
            if note_file.exists():
                note_content = note_file.read_text(encoding="utf-8", errors="ignore")[:2000]
        except Exception:
            pass

    prompt_parts = [f"業務名: {log['project_name']}", f"日付: {log['date']}"]
    if note_content:
        prompt_parts.append(f"noteの内容:\n{note_content}")
    if log["comment"]:
        prompt_parts.append(f"現在のコメント: {log['comment']}")

    prompt = "\n".join(prompt_parts) + "\n\n上記の業務内容から、その日の進捗を50文字以内の一言コメントにまとめてください。"

    from llm import generate
    summary = await generate(prompt, db=db)
    if summary is None:
        raise HTTPException(503, "LM Studio に接続できません。設定を確認してください。")

    # Save the generated comment
    await db.execute("UPDATE daily_logs SET comment = ? WHERE id = ?", (summary, log_id))
    await db.execute(
        "DELETE FROM search_index WHERE doc_type = 'daily_log' AND doc_id = ?", (log_id,)
    )
    await db.execute(
        "INSERT INTO search_index (doc_type, doc_id, title, content) VALUES ('daily_log', ?, ?, ?)",
        (log_id, log["date"], summary),
    )
    await db.commit()
    return {"comment": summary}


@router.post("/api/projects/{project_id}/weekly-summaries/{week_start}/generate")
async def generate_weekly_summary(
    project_id: str,
    week_start: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """LLM週次サマリー生成: 週のdaily_logsコメント + noteの内容から自動要約"""
    from datetime import date, timedelta
    from llm import generate

    async with db.execute("SELECT id, name FROM projects WHERE id = ?", (project_id,)) as cur:
        project = await cur.fetchone()
    if not project:
        raise HTTPException(404, "プロジェクトが見つかりません")

    # Calculate week end
    try:
        week_date = date.fromisoformat(week_start)
        week_end = (week_date + timedelta(days=6)).isoformat()
    except ValueError:
        raise HTTPException(400, "week_startの形式が不正です (YYYY-MM-DD)")

    # Gather daily logs for the week
    async with db.execute(
        """SELECT date, comment, obsidian_note_path
           FROM daily_logs
           WHERE project_id = ? AND date >= ? AND date <= ?
           ORDER BY date""",
        (project_id, week_start, week_end),
    ) as cur:
        logs = await cur.fetchall()

    # Build context
    context_lines = [f"業務名: {project['name']}", f"期間: {week_start} 〜 {week_end}", ""]

    for log in logs:
        line = f"【{log['date']}】"
        if log["comment"]:
            line += f" {log['comment']}"
        context_lines.append(line)

        # Append note content if available
        if log["obsidian_note_path"]:
            try:
                from obsidian import get_projects_path
                note_file = get_projects_path() / log["obsidian_note_path"]
                if note_file.exists():
                    note_text = note_file.read_text(encoding="utf-8", errors="ignore")
                    context_lines.append(f"  [note] {note_text.strip()[:400]}")
            except Exception:
                pass

    if len(logs) == 0:
        context_lines.append("（この週の活動記録なし）")

    prompt = (
        "\n".join(context_lines)
        + "\n\n上記の週次活動を、上司報告・週報として使える300文字以内のサマリーにまとめてください。"
        "「実施内容:」「課題:」「来週の予定:」の構成で記述してください。"
    )

    summary = await generate(prompt, db=db)
    if summary is None:
        raise HTTPException(503, "LM Studio に接続できません。設定を確認してください。")

    # Upsert weekly summary
    sid = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO weekly_summaries (id, project_id, week_start, content, source)
           VALUES (?, ?, ?, ?, 'llm_generated')
           ON CONFLICT(project_id, week_start) DO UPDATE SET
             content = excluded.content,
             source = 'llm_generated',
             updated_at = datetime('now')""",
        (sid, project_id, week_start, summary),
    )
    await db.execute(
        "DELETE FROM search_index WHERE doc_type = 'weekly_summary' AND doc_id = ?",
        (f"{project_id}_{week_start}",),
    )
    await db.execute(
        "INSERT INTO search_index (doc_type, doc_id, title, content) VALUES ('weekly_summary', ?, ?, ?)",
        (f"{project_id}_{week_start}", f"週次サマリー {week_start}", summary),
    )
    await db.commit()
    return {"content": summary, "week_start": week_start}
