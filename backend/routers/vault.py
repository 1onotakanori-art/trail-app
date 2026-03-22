import re
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
import aiosqlite

from database import get_db
from auth import get_current_user
from obsidian import get_vault_path, get_vault_tree, scan_vault, obsidian_uri
from config import settings

router = APIRouter(prefix="/api/vault", tags=["vault"])


@router.post("/sync")
async def manual_sync(
    current_user: dict = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(get_db),
):
    count = await scan_vault(settings.database_url)
    return {"synced": count}


@router.get("/status")
async def vault_status(
    current_user: dict = Depends(get_current_user),
):
    vault = get_vault_path()
    return {
        "vault_path": str(vault),
        "vault_exists": vault.exists(),
        "vault_name": settings.vault_name,
    }


@router.get("/tree")
async def vault_tree(
    current_user: dict = Depends(get_current_user),
):
    return get_vault_tree()


@router.get("/preview/{note_path:path}", response_class=HTMLResponse)
async def preview_note(
    note_path: str,
    current_user: dict = Depends(get_current_user),
):
    vault = get_vault_path()
    full_path = vault / note_path

    if not full_path.exists() or not full_path.suffix == ".md":
        raise HTTPException(404, "ファイルが見つかりません")

    # security: must be within vault
    try:
        full_path.resolve().relative_to(vault.resolve())
    except ValueError:
        raise HTTPException(403, "アクセス権限がありません")

    text = full_path.read_text(encoding="utf-8", errors="ignore")

    # strip frontmatter
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            text = text[end + 4:].lstrip()

    html = markdown_to_html(text, vault, note_path)
    return f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
       padding: 16px; font-size: 14px; line-height: 1.6; color: #333; }}
h1,h2,h3 {{ color: #1a237e; }}
code {{ background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-size: 13px; }}
pre {{ background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }}
a {{ color: #1565c0; }}
blockquote {{ border-left: 3px solid #90caf9; margin-left: 0; padding-left: 16px; color: #666; }}
</style>
</head><body>{html}</body></html>"""


def markdown_to_html(text: str, vault: Path, current_path: str) -> str:
    """Minimal Markdown → HTML converter (no external deps for Phase 1)."""
    lines = text.split("\n")
    html_lines = []
    in_code = False
    in_list = False

    for line in lines:
        # code blocks
        if line.startswith("```"):
            if in_code:
                html_lines.append("</code></pre>")
                in_code = False
            else:
                lang = line[3:].strip()
                html_lines.append(f'<pre><code class="language-{lang}">')
                in_code = True
            continue
        if in_code:
            html_lines.append(_escape(line))
            continue

        # headings
        m = re.match(r'^(#{1,6})\s+(.*)', line)
        if m:
            level = len(m.group(1))
            html_lines.append(f"<h{level}>{_inline(m.group(2))}</h{level}>")
            continue

        # list items
        if re.match(r'^[-*]\s', line):
            if not in_list:
                html_lines.append("<ul>")
                in_list = True
            html_lines.append(f"<li>{_inline(line[2:])}</li>")
            continue
        if in_list:
            html_lines.append("</ul>")
            in_list = False

        # empty line
        if not line.strip():
            html_lines.append("<br>")
            continue

        html_lines.append(f"<p>{_inline(line)}</p>")

    if in_list:
        html_lines.append("</ul>")
    if in_code:
        html_lines.append("</code></pre>")

    return "\n".join(html_lines)


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _inline(text: str) -> str:
    # Obsidian internal links [[...]]
    text = re.sub(
        r'\[\[([^\]]+)\]\]',
        lambda m: f'<span style="color:#1565c0">📄 {_escape(m.group(1))}</span>',
        text,
    )
    # Bold
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    # Italic
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    # Inline code
    text = re.sub(r'`(.+?)`', r'<code>\1</code>', text)
    # Links
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    return text
