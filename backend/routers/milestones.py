import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import aiosqlite

from database import get_db
from auth import get_current_user

router = APIRouter(tags=["milestones"])

# 3-1: Column whitelist for milestones PATCH
MILESTONES_ALLOWED_COLUMNS = {"title", "date", "description"}


class MilestoneCreate(BaseModel):
    title: str
    date: str
    description: Optional[str] = None


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None


@router.get("/api/projects/{project_id}/milestones")
async def list_milestones(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT * FROM milestones WHERE project_id = ? ORDER BY date",
        (project_id,),
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


@router.post("/api/projects/{project_id}/milestones", status_code=201)
async def create_milestone(
    project_id: str,
    body: MilestoneCreate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    mid = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO milestones (id, project_id, title, date, description) VALUES (?, ?, ?, ?, ?)",
        (mid, project_id, body.title, body.date, body.description or ""),
    )
    await db.commit()
    return {"id": mid}


@router.patch("/api/milestones/{milestone_id}")
async def update_milestone(
    milestone_id: str,
    body: MilestoneUpdate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "更新項目がありません")

    # 3-1: Verify all column names are in whitelist
    for col in updates:
        if col not in MILESTONES_ALLOWED_COLUMNS:
            raise HTTPException(400, f"不正なカラム名: {col}")

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    await db.execute(
        f"UPDATE milestones SET {set_clause} WHERE id = ?",
        list(updates.values()) + [milestone_id],
    )
    await db.commit()
    return {"ok": True}


@router.delete("/api/milestones/{milestone_id}")
async def delete_milestone(
    milestone_id: str,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    await db.execute("DELETE FROM milestones WHERE id = ?", (milestone_id,))
    await db.commit()
    return {"ok": True}
