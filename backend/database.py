import aiosqlite
from config import settings

DB_PATH = settings.database_url

CREATE_TABLES_SQL = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dashboard_widgets TEXT NOT NULL DEFAULT '[]',
    updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    state TEXT NOT NULL DEFAULT '進行中' CHECK(state IN ('進行中', '待機中', '完了')),
    feeling TEXT DEFAULT '順調' CHECK(feeling IN ('順調', 'やや不安', '遅延しそう', '相談したい')),
    feeling_updated_at DATETIME,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    box_url TEXT,
    box_local_path TEXT,
    obsidian_folder TEXT,
    archived BOOLEAN NOT NULL DEFAULT 0,
    close_summary TEXT,
    close_outputs TEXT DEFAULT '[]',
    closed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    planned_start DATE NOT NULL,
    planned_end DATE NOT NULL,
    actual_start DATE,
    actual_end DATE,
    status TEXT NOT NULL DEFAULT '未着手' CHECK(status IN ('未着手', '進行中', '完了')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_dependencies (
    id TEXT PRIMARY KEY,
    predecessor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    successor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dep_type TEXT NOT NULL DEFAULT 'FS' CHECK(dep_type IN ('FS')),
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_daily_progress (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    progress INTEGER NOT NULL DEFAULT 100 CHECK(progress IN (0, 20, 40, 60, 80, 100)),
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(task_id, date)
);

CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date DATE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    comment TEXT,
    obsidian_note_path TEXT,
    obsidian_uri TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('vault_sync', 'manual', 'llm_generated')),
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS weekly_summaries (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'llm_generated', 'edited')),
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id, week_start)
);

CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'project' CHECK(type IN ('project', 'general', 'dm')),
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS channel_subscriptions (
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bookmarked BOOLEAN NOT NULL DEFAULT 0,
    subscribed_at DATETIME NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    tag TEXT CHECK(tag IN ('報告', '連絡', '相談')),
    mentions TEXT NOT NULL DEFAULT '[]',
    reactions TEXT NOT NULL DEFAULT '{}',
    obsidian_links TEXT NOT NULL DEFAULT '[]',
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('mention', 'message', 'follow_alert', 'project_created')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    link_type TEXT CHECK(link_type IN ('channel', 'project')),
    link_id TEXT,
    read BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS note_sync_log (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    note_path TEXT NOT NULL,
    date DATE,
    frontmatter TEXT NOT NULL DEFAULT '{}',
    file_hash TEXT,
    synced_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    doc_type,
    doc_id,
    title,
    content,
    tokenize="unicode61"
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);
"""

SEED_SQL = """
INSERT OR IGNORE INTO channels (id, project_id, name, type)
VALUES ('channel-general', NULL, '全体', 'general');
"""

# Migrations for existing databases (non-destructive ALTER TABLE additions)
MIGRATION_SQL = """
-- 1-5: Add created_at to milestones if missing
-- (ALTER TABLE ADD COLUMN is safe — ignores if column exists via IF NOT EXISTS-like behaviour in SQLite)
-- SQLite does not support IF NOT EXISTS for ADD COLUMN, so we handle errors in code.
"""


async def get_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(CREATE_TABLES_SQL)
        await db.executescript(SEED_SQL)
        # Run safe migrations for existing databases
        migrations = [
            "ALTER TABLE milestones ADD COLUMN created_at DATETIME NOT NULL DEFAULT (datetime('now'))",
        ]
        for sql in migrations:
            try:
                await db.execute(sql)
            except Exception:
                pass  # Column already exists
        await db.commit()
