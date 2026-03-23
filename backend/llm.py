"""LM Studio / OpenAI-compatible API client for TRAIL."""

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


async def _get_effective_url(db=None) -> tuple[str, str]:
    """Return (base_url, model) from system_settings DB or config fallback."""
    from config import settings

    base_url = settings.lm_studio_url
    model = settings.lm_studio_model

    if db is not None:
        try:
            async with db.execute(
                "SELECT key, value FROM system_settings WHERE key IN ('lm_studio_url', 'lm_studio_model')"
            ) as cur:
                rows = await cur.fetchall()
            for row in rows:
                if row["key"] == "lm_studio_url" and row["value"]:
                    base_url = row["value"]
                elif row["key"] == "lm_studio_model" and row["value"]:
                    model = row["value"]
        except Exception:
            pass

    return base_url, model


async def generate(
    prompt: str,
    system: str = "あなたは業務進捗管理アシスタントです。日本語で簡潔に回答してください。",
    max_tokens: int = 512,
    db=None,
) -> Optional[str]:
    """
    Send a chat completion request to LM Studio (OpenAI-compatible endpoint).

    Returns the generated text, or None if LM Studio is unavailable.
    """
    base_url, model = await _get_effective_url(db)

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{base_url.rstrip('/')}/chat/completions",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
    except httpx.ConnectError:
        logger.warning("LM Studio に接続できません。URLを確認してください: %s", base_url)
        return None
    except httpx.TimeoutException:
        logger.warning("LM Studio タイムアウト")
        return None
    except Exception as e:
        logger.warning("LLM生成エラー: %s", e)
        return None


async def check_connection(db=None) -> dict:
    """Check if LM Studio is reachable and return status."""
    base_url, model = await _get_effective_url(db)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{base_url.rstrip('/')}/models")
            if resp.status_code == 200:
                models = resp.json().get("data", [])
                return {
                    "connected": True,
                    "url": base_url,
                    "model": model,
                    "available_models": [m.get("id") for m in models],
                }
    except Exception:
        pass
    return {"connected": False, "url": base_url, "model": model, "available_models": []}
