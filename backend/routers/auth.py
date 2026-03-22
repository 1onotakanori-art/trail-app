import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import aiosqlite

from database import get_db
from auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: aiosqlite.Connection = Depends(get_db)):
    async with db.execute(
        "SELECT id, username, password_hash, display_name, role FROM users WHERE username = ?",
        (body.username,),
    ) as cursor:
        row = await cursor.fetchone()

    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ユーザー名またはパスワードが正しくありません",
        )

    access_token = create_access_token({"sub": row["id"]})
    refresh_token = create_refresh_token({"sub": row["id"]})
    user = {
        "id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"],
        "role": row["role"],
    }
    return LoginResponse(access_token=access_token, refresh_token=refresh_token, user=user)


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(body: RefreshRequest, db: aiosqlite.Connection = Depends(get_db)):
    user_id = decode_refresh_token(body.refresh_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="リフレッシュトークンが無効または期限切れです",
        )

    # Verify user still exists
    async with db.execute("SELECT id FROM users WHERE id = ?", (user_id,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ユーザーが見つかりません",
        )

    new_access_token = create_access_token({"sub": user_id})
    new_refresh_token = create_refresh_token({"sub": user_id})
    return RefreshResponse(access_token=new_access_token, refresh_token=new_refresh_token)


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
