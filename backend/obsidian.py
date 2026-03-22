"""Obsidian Vault 連携モジュール"""
import asyncio
import hashlib
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
import aiosqlite

from config import settings
from websocket import manager


def get_vault_path() -> Path:
    return Path(settings.vault_path)


def get_projects_path() -> Path:
    return get_vault_path() / settings.project_folder


def obsidian_uri(note_path: str) -> str:
    import urllib.parse
    encoded = urllib.parse.quote(note_path, safe="")
    return f"obsidian://open?vault={urllib.parse.quote(settings.vault_name)}&file={encoded}"


# ── Project folder / template generation ──────────────────────────────────

PROJECT_TEMPLATE = """\
---
tags: [project]
project_id: {project_id}
project_name: {project_name}
owner: {owner_name}
start_date: {start_date}
end_date: {end_date}
state: 進行中
box_url: {box_url}
box_local_path: {box_local_path}
---

# {project_name}

## 概要
（ここに業務概要を記載）

## 関連リンク
- Box: [作業フォルダ]({box_url})

## 完了情報
<!-- クローズ時に自動追記 -->
"""

NOTE_TEMPLATE = """\
---
date: {date}
project: "[[★{project_name}]]"
owner: {owner_name}
tags: [note]
---

# 本日の作業内容

"""


async def create_project_folder(
    project_id: str,
    project_name: str,
    owner_name: str,
    start_date: str,
    end_date: str,
    box_url: str = "",
    box_local_path: str = "",
):
    date_prefix = datetime.now().strftime("%Y%m%d")
    folder_name = f"{date_prefix}_{project_name}"
    folder_path = get_projects_path() / folder_name

    folder_path.mkdir(parents=True, exist_ok=True)

    star_file = folder_path / f"★{project_name}.md"
    if not star_file.exists():
        content = PROJECT_TEMPLATE.format(
            project_id=project_id,
            project_name=project_name,
            owner_name=owner_name,
            start_date=start_date,
            end_date=end_date,
            box_url=box_url,
            box_local_path=box_local_path,
        )
        star_file.write_text(content, encoding="utf-8")

    # ensure template files exist
    template_dir = get_vault_path() / "400_Template"
    template_dir.mkdir(parents=True, exist_ok=True)
    note_tmpl = template_dir / "note.md"
    if not note_tmpl.exists():
        note_tmpl.write_text(
            NOTE_TEMPLATE.format(date="{{date}}", project_name="{{project_name}}", owner_name="{{owner_name}}"),
            encoding="utf-8",
        )

    return str(folder_path.relative_to(get_vault_path()))


async def update_project_close(
    obsidian_folder: str,
    project_name: str,
    close_summary: str,
    close_outputs: list,
    closed_at: str,
):
    star_file = get_vault_path() / obsidian_folder / f"★{project_name}.md"
    if not star_file.exists():
        return

    content = star_file.read_text(encoding="utf-8")
    outputs_md = "\n".join(f"- {o.get('label', o.get('url', str(o)))}" for o in close_outputs)
    appendix = f"""
## 完了情報
- 完了日: {closed_at[:10]}
- サマリー: {close_summary}

### 最終アウトプット
{outputs_md}
"""
    # replace placeholder comment
    content = content.replace("<!-- クローズ時に自動追記 -->", appendix)
    star_file.write_text(content, encoding="utf-8")


# ── Frontmatter parser ─────────────────────────────────────────────────────

def parse_frontmatter(text: str) -> dict:
    """Simple YAML frontmatter parser (no external deps)."""
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    fm_text = text[4:end]
    result: dict = {}
    for line in fm_text.splitlines():
        m = re.match(r'^(\w+):\s*(.+)$', line.strip())
        if m:
            key, val = m.group(1), m.group(2).strip().strip('"')
            if val.startswith("[") and val.endswith("]"):
                items = val[1:-1].split(",")
                result[key] = [i.strip().strip('"') for i in items if i.strip()]
            else:
                result[key] = val
    return result


def file_hash(path: Path) -> str:
    h = hashlib.md5(path.read_bytes()).hexdigest()
    return h


# ── Vault directory tree ───────────────────────────────────────────────────

def build_tree(path: Path, relative_to: Path) -> dict:
    rel = str(path.relative_to(relative_to))
    node: dict = {"name": path.name, "path": rel, "type": "dir" if path.is_dir() else "file"}
    if path.is_dir():
        children = []
        try:
            for child in sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
                if child.name.startswith("."):
                    continue
                children.append(build_tree(child, relative_to))
        except PermissionError:
            pass
        node["children"] = children
    return node


def get_vault_tree() -> dict:
    vault = get_vault_path()
    if not vault.exists():
        return {"name": vault.name, "path": "", "type": "dir", "children": []}
    return build_tree(vault, vault)


# ── Vault sync / watchdog ─────────────────────────────────────────────────

async def sync_note_file(note_path: Path, db_path: str):
    """Process a single note file and register to DB."""
    vault = get_vault_path()
    projects_dir = get_projects_path()

    # must be under 200_Projects/
    try:
        note_path.relative_to(projects_dir)
    except ValueError:
        return

    # skip ★ files
    if note_path.name.startswith("★"):
        return

    text = note_path.read_text(encoding="utf-8", errors="ignore")
    fm = parse_frontmatter(text)

    # must have note tag
    tags = fm.get("tags", [])
    if isinstance(tags, str):
        tags = [tags]
    if "note" not in tags:
        return

    # find project_id from parent folder's ★ file
    project_folder = note_path.parent
    star_files = list(project_folder.glob("★*.md"))
    if not star_files:
        return

    star_text = star_files[0].read_text(encoding="utf-8", errors="ignore")
    star_fm = parse_frontmatter(star_text)
    project_id = star_fm.get("project_id")
    if not project_id:
        return

    rel_path = str(note_path.relative_to(vault))
    note_date = fm.get("date", datetime.now().date().isoformat())
    fhash = file_hash(note_path)
    uri = obsidian_uri(rel_path)

    import json
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row

        # check existing hash
        async with db.execute(
            "SELECT id, file_hash FROM note_sync_log WHERE note_path = ?", (rel_path,)
        ) as cur:
            existing = await cur.fetchone()

        if existing and existing["file_hash"] == fhash:
            return  # no change

        sync_id = str(uuid.uuid4())
        if existing:
            await db.execute(
                "UPDATE note_sync_log SET file_hash = ?, synced_at = datetime('now') WHERE note_path = ?",
                (fhash, rel_path),
            )
        else:
            await db.execute(
                """INSERT INTO note_sync_log (id, project_id, note_path, date, frontmatter, file_hash)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (sync_id, project_id, rel_path, note_date, json.dumps(fm), fhash),
            )

        # daily_logs
        async with db.execute(
            "SELECT id FROM daily_logs WHERE project_id = ? AND obsidian_note_path = ?",
            (project_id, rel_path),
        ) as cur:
            log_existing = await cur.fetchone()

        if not log_existing:
            log_id = str(uuid.uuid4())
            await db.execute(
                """INSERT INTO daily_logs (id, project_id, date, obsidian_note_path, obsidian_uri, source)
                   VALUES (?, ?, ?, ?, ?, 'vault_sync')""",
                (log_id, project_id, note_date, rel_path, uri),
            )
            # FTS
            await db.execute(
                "INSERT INTO search_index (doc_type, doc_id, title, content) VALUES ('note', ?, ?, ?)",
                (log_id, note_path.stem, text[:2000]),
            )

        await db.commit()

    # WebSocket notification
    await manager.broadcast({"type": "note_synced", "project_id": project_id, "path": rel_path})
    await manager.broadcast({"type": "vault_tree_updated"})


async def scan_vault(db_path: str):
    """Full vault scan."""
    projects_dir = get_projects_path()
    if not projects_dir.exists():
        return 0
    count = 0
    for md_file in projects_dir.rglob("*.md"):
        try:
            await sync_note_file(md_file, db_path)
            count += 1
        except Exception:
            pass
    return count


# ── Watchdog watcher ──────────────────────────────────────────────────────

_watcher_task: Optional[asyncio.Task] = None


async def start_watcher(db_path: str):
    """Start file watcher using watchdog in a thread."""
    global _watcher_task
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler, FileCreatedEvent, FileModifiedEvent

        class VaultHandler(FileSystemEventHandler):
            def __init__(self):
                self._loop = asyncio.get_event_loop()

            def _handle(self, path: str):
                if not path.endswith(".md"):
                    return
                asyncio.run_coroutine_threadsafe(
                    sync_note_file(Path(path), db_path), self._loop
                )

            def on_created(self, event):
                if not event.is_directory:
                    self._handle(event.src_path)

            def on_modified(self, event):
                if not event.is_directory:
                    self._handle(event.src_path)

        projects_dir = get_projects_path()
        projects_dir.mkdir(parents=True, exist_ok=True)

        observer = Observer()
        observer.schedule(VaultHandler(), str(projects_dir), recursive=True)
        observer.start()
        print(f"✅ Vault watchdog 開始: {projects_dir}")

        async def _keep_alive():
            try:
                while True:
                    await asyncio.sleep(1)
            except asyncio.CancelledError:
                observer.stop()
                observer.join()

        _watcher_task = asyncio.create_task(_keep_alive())

    except ImportError:
        print("⚠️  watchdog 未インストール。自動同期は無効です。")
