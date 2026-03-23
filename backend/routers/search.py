import re
from fastapi import APIRouter, Depends, Query
import aiosqlite

from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/search", tags=["search"])

# FTS5 special characters that need escaping
_FTS5_SPECIAL = re.compile(r'["\(\)\*:\^]')


def _sanitize_fts5(q: str) -> str:
    """Wrap query in double quotes to treat as phrase, fallback to token search."""
    # Remove FTS5 special chars and wrap each token
    tokens = q.strip().split()
    if not tokens:
        return '""'
    # Escape double quotes inside tokens, then wrap each token
    safe = " ".join(
        '"' + token.replace('"', '') + '"'
        for token in tokens
        if token.replace('"', '').strip()
    )
    return safe if safe.strip() else '""'


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not q.strip():
        return []

    fts_query = _sanitize_fts5(q)
    try:
        async with db.execute(
            """SELECT doc_type, doc_id, title, content,
                      snippet(search_index, 3, '<mark>', '</mark>', '...', 20) as snippet
               FROM search_index
               WHERE search_index MATCH ?
               ORDER BY rank
               LIMIT 30""",
            (fts_query,),
        ) as cur:
            rows = await cur.fetchall()
    except Exception:
        return []

    results = []
    for r in rows:
        results.append({
            "type": r["doc_type"],
            "id": r["doc_id"],
            "title": r["title"],
            "snippet": r["snippet"],
        })
    return results
