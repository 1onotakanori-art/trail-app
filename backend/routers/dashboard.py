"""ダッシュボード集計API"""
import json
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends
import aiosqlite

from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _week_range():
    """今週の月〜日を返す"""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


@router.get("")
async def get_dashboard(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    user_id = current_user["id"]
    week_start, week_end = _week_range()
    today = date.today().isoformat()

    # ── 未読メッセージ（メンション + 購読チャンネルの最新） ─────────────
    async with db.execute(
        """
        SELECT n.id, n.type, n.title, n.body, n.link_type, n.link_id, n.created_at
        FROM notifications
        WHERE user_id = ? AND read = 0
        ORDER BY created_at DESC LIMIT 10
        """,
        (user_id,),
    ) as cur:
        unread_notifications = [dict(r) for r in await cur.fetchall()]

    # ── 要確認アラート ─────────────────────────────────────────────────
    # 1) 進行中プロジェクトで 2日以上 note 更新なし
    two_days_ago = (date.today() - timedelta(days=2)).isoformat()
    async with db.execute(
        """
        SELECT p.id, p.name, p.owner_id, u.display_name as owner_name,
               MAX(dl.date) as last_note_date
        FROM projects p
        JOIN users u ON u.id = p.owner_id
        LEFT JOIN daily_logs dl ON dl.project_id = p.id AND dl.obsidian_note_path IS NOT NULL
        WHERE p.archived = 0 AND p.state = '進行中'
        GROUP BY p.id
        HAVING last_note_date IS NULL OR last_note_date < ?
        ORDER BY last_note_date ASC NULLS FIRST
        LIMIT 10
        """,
        (two_days_ago,),
    ) as cur:
        stale_projects = [dict(r) for r in await cur.fetchall()]

    # 2) Feeling が「遅延しそう」「相談したい」
    async with db.execute(
        """
        SELECT p.id, p.name, p.feeling, u.display_name as owner_name
        FROM projects p
        JOIN users u ON u.id = p.owner_id
        WHERE p.archived = 0 AND p.state = '進行中'
          AND p.feeling IN ('遅延しそう', '相談したい')
        ORDER BY p.feeling_updated_at DESC
        LIMIT 10
        """,
    ) as cur:
        feeling_alerts = [dict(r) for r in await cur.fetchall()]

    # ── 今週のマイルストーン ───────────────────────────────────────────
    async with db.execute(
        """
        SELECT m.id, m.title, m.date, m.description,
               p.id as project_id, p.name as project_name
        FROM milestones m
        JOIN projects p ON p.id = m.project_id
        WHERE m.date BETWEEN ? AND ? AND p.archived = 0
        ORDER BY m.date
        """,
        (week_start, week_end),
    ) as cur:
        week_milestones = [dict(r) for r in await cur.fetchall()]

    # ── 自分の業務一覧 ─────────────────────────────────────────────────
    async with db.execute(
        """
        SELECT id, name, state, feeling, start_date, end_date, tags
        FROM projects
        WHERE owner_id = ? AND archived = 0
        ORDER BY state, created_at DESC
        """,
        (user_id,),
    ) as cur:
        my_projects = []
        for r in await cur.fetchall():
            d = dict(r)
            d["tags"] = json.loads(d.get("tags") or "[]")
            my_projects.append(d)

    # ── 最近更新されたnote ─────────────────────────────────────────────
    async with db.execute(
        """
        SELECT dl.id, dl.date, dl.obsidian_note_path, dl.obsidian_uri,
               p.name as project_name, p.id as project_id
        FROM daily_logs dl
        JOIN projects p ON p.id = dl.project_id
        WHERE dl.obsidian_note_path IS NOT NULL
        ORDER BY dl.date DESC, dl.created_at DESC
        LIMIT 10
        """,
    ) as cur:
        recent_notes = [dict(r) for r in await cur.fetchall()]

    # ── ガント俯瞰（全プロジェクト要約） ──────────────────────────────
    async with db.execute(
        """
        SELECT p.id, p.name, p.owner_id, p.state, p.feeling,
               p.start_date, p.end_date,
               u.display_name as owner_name
        FROM projects p
        JOIN users u ON u.id = p.owner_id
        WHERE p.archived = 0
        ORDER BY p.start_date
        LIMIT 20
        """,
    ) as cur:
        mini_gantt = [dict(r) for r in await cur.fetchall()]

    return {
        "unread_notifications": unread_notifications,
        "stale_projects": stale_projects,
        "feeling_alerts": feeling_alerts,
        "week_milestones": week_milestones,
        "my_projects": my_projects,
        "recent_notes": recent_notes,
        "mini_gantt": mini_gantt,
        "today": today,
        "week_start": week_start,
        "week_end": week_end,
    }


@router.get("/alerts")
async def get_alerts(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """進捗フォローアラート（管理者向け）"""
    two_days_ago = (date.today() - timedelta(days=2)).isoformat()

    async with db.execute(
        """
        SELECT p.id, p.name, p.owner_id, p.feeling, p.state,
               u.display_name as owner_name,
               MAX(dl.date) as last_note_date,
               (julianday('now') - julianday(COALESCE(MAX(dl.date), p.created_at))) as days_stale
        FROM projects p
        JOIN users u ON u.id = p.owner_id
        LEFT JOIN daily_logs dl ON dl.project_id = p.id AND dl.obsidian_note_path IS NOT NULL
        WHERE p.archived = 0 AND p.state = '進行中'
        GROUP BY p.id
        HAVING days_stale >= 2 OR p.feeling IN ('遅延しそう', '相談したい')
        ORDER BY days_stale DESC
        """,
    ) as cur:
        rows = [dict(r) for r in await cur.fetchall()]

    return rows
