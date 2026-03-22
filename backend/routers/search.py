from fastapi import APIRouter, Depends, Query
import aiosqlite

from database import get_db
from auth import get_current_user

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    if not q.strip():
        return []

    # FTS5 search
    async with db.execute(
        """SELECT doc_type, doc_id, title, content,
                  snippet(search_index, 3, '<mark>', '</mark>', '...', 20) as snippet
           FROM search_index
           WHERE search_index MATCH ?
           ORDER BY rank
           LIMIT 30""",
        (q,),
    ) as cur:
        rows = await cur.fetchall()

    results = []
    for r in rows:
        results.append({
            "type": r["doc_type"],
            "id": r["doc_id"],
            "title": r["title"],
            "snippet": r["snippet"],
        })
    return results
