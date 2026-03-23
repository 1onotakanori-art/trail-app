"""System settings API (admin only)."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import aiosqlite

from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

_ALLOWED_KEYS = {"lm_studio_url", "lm_studio_model"}


class SettingsPatch(BaseModel):
    lm_studio_url: Optional[str] = None
    lm_studio_model: Optional[str] = None


@router.get("")
async def get_settings(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Return current system settings (LM Studio URL/model + connection status)."""
    from config import settings as cfg
    from llm import check_connection

    # Read overrides from DB
    async with db.execute(
        "SELECT key, value FROM system_settings WHERE key IN ('lm_studio_url', 'lm_studio_model')"
    ) as cur:
        rows = {r["key"]: r["value"] for r in await cur.fetchall()}

    lm_url = rows.get("lm_studio_url") or cfg.lm_studio_url
    lm_model = rows.get("lm_studio_model") or cfg.lm_studio_model

    status = await check_connection(db)
    return {
        "lm_studio_url": lm_url,
        "lm_studio_model": lm_model,
        "lm_studio_connected": status["connected"],
        "lm_studio_available_models": status["available_models"],
    }


@router.patch("")
async def update_settings(
    body: SettingsPatch,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Update system settings (admin only)."""
    if current_user.get("role") != "admin":
        raise HTTPException(403, "管理者のみ設定を変更できます")

    updates = {}
    if body.lm_studio_url is not None:
        updates["lm_studio_url"] = body.lm_studio_url.strip()
    if body.lm_studio_model is not None:
        updates["lm_studio_model"] = body.lm_studio_model.strip()

    for key, value in updates.items():
        await db.execute(
            """INSERT INTO system_settings (key, value) VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value""",
            (key, value),
        )
    await db.commit()
    return {"ok": True}


@router.get("/llm-check")
async def llm_connection_check(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    """Check LM Studio connection status."""
    from llm import check_connection
    return await check_connection(db)
