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


class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str
    role: str = "member"


@router.post("/register", response_model=LoginResponse, status_code=201)
async def register(body: RegisterRequest, db: aiosqlite.Connection = Depends(get_db)):
    if body.role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="roleはadminまたはmemberを指定してください")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="パスワードは6文字以上にしてください")
    if not body.username.strip():
        raise HTTPException(status_code=400, detail="ユーザー名を入力してください")

    async with db.execute("SELECT id FROM users WHERE username = ?", (body.username,)) as cur:
        if await cur.fetchone():
            raise HTTPException(status_code=409, detail="そのユーザー名は既に使用されています")

    user_id = str(uuid.uuid4())
    hashed = get_password_hash(body.password)
    await db.execute(
        "INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)",
        (user_id, body.username.strip(), hashed, body.display_name.strip() or body.username.strip(), body.role),
    )
    await db.commit()

    access_token = create_access_token({"sub": user_id})
    refresh_token = create_refresh_token({"sub": user_id})
    user = {
        "id": user_id,
        "username": body.username.strip(),
        "display_name": body.display_name.strip() or body.username.strip(),
        "role": body.role,
    }
    return LoginResponse(access_token=access_token, refresh_token=refresh_token, user=user)
