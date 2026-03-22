import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
import aiosqlite

from database import get_db
from auth import get_current_user, get_admin_user, get_password_hash, verify_password

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    display_name: str
    role: str = "member"


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[str] = None


class PasswordReset(BaseModel):
    new_password: str


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


class SettingsUpdate(BaseModel):
    dashboard_widgets: list


@router.get("")
async def list_users(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    async with db.execute(
        "SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at"
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.post("", status_code=201)
async def create_user(
    body: UserCreate,
    _: dict = Depends(get_admin_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    user_id = str(uuid.uuid4())
    hashed = get_password_hash(body.password)
    try:
        await db.execute(
            "INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)",
            (user_id, body.username, hashed, body.display_name, body.role),
        )
        await db.commit()
    except aiosqlite.IntegrityError:
        raise HTTPException(status_code=409, detail="ユーザー名が既に存在します")

    return {"id": user_id, "username": body.username, "display_name": body.display_name, "role": body.role}


@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if current_user["role"] != "admin" and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="権限がありません")

    # 3-1: Column whitelist for users
    ALLOWED_COLUMNS = {"display_name", "role"}
    updates = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name
    if body.role is not None:
        if current_user["role"] != "admin":
            raise HTTPException(status_code=403, detail="ロール変更は管理者のみです")
        updates["role"] = body.role

    if not updates:
        raise HTTPException(status_code=400, detail="更新項目がありません")

    # Verify all columns are in whitelist
    for col in updates:
        if col not in ALLOWED_COLUMNS:
            raise HTTPException(status_code=400, detail=f"不正なカラム名: {col}")

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [user_id]
    await db.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
    await db.commit()
    return {"ok": True}


# 2-4: PUT /api/users/{id}/profile
@router.put("/{user_id}/profile")
async def update_profile(
    user_id: str,
    body: ProfileUpdate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="自分のプロフィールのみ変更できます")

    updates = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name

    if not updates:
        raise HTTPException(status_code=400, detail="更新項目がありません")

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [user_id]
    await db.execute(f"UPDATE users SET {set_clause} WHERE id = ?", values)
    await db.commit()
    return {"ok": True}


# 2-5: POST /api/users/{id}/change-password
@router.post("/{user_id}/change-password")
async def change_password(
    user_id: str,
    body: ChangePassword,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="自分のパスワードのみ変更できます")

    async with db.execute(
        "SELECT password_hash FROM users WHERE id = ?", (user_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")

    if not verify_password(body.current_password, row["password_hash"]):
        raise HTTPException(status_code=400, detail="現在のパスワードが正しくありません")

    hashed = get_password_hash(body.new_password)
    await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hashed, user_id))
    await db.commit()
    return {"ok": True}


@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    body: PasswordReset,
    _: dict = Depends(get_admin_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    hashed = get_password_hash(body.new_password)
    await db.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?", (hashed, user_id)
    )
    await db.commit()
    return {"ok": True}


@router.patch("/{user_id}/settings")
async def update_settings(
    user_id: str,
    body: SettingsUpdate,
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="権限がありません")

    import json
    widgets_json = json.dumps(body.dashboard_widgets, ensure_ascii=False)
    settings_id = str(uuid.uuid4())
    await db.execute(
        """INSERT INTO user_settings (id, user_id, dashboard_widgets)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET dashboard_widgets = excluded.dashboard_widgets,
           updated_at = datetime('now')""",
        (settings_id, user_id, widgets_json),
    )
    await db.commit()
    return {"ok": True}
