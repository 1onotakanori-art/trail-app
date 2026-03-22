# TRAIL 設計書 vs 実装 監査結果 — 修正一覧

## A. DB設計（DESIGN.md セクション4 vs database.py）

### A-1【中】task_dependencies.dep_type に CHECK 制約なし
- **場所:** `backend/database.py:63`
- **設計書:** dep_type は `FS`（将来拡張可）
- **現状:** `TEXT NOT NULL DEFAULT 'FS'` — CHECK なし。任意文字列が挿入可能
- **修正:** `CHECK(dep_type IN ('FS'))` を追加（将来拡張時に値を追加）

### A-2【中】messages.user_id に ON DELETE CASCADE なし
- **場所:** `backend/database.py:126`
- **設計書:** TEXT FK → users
- **現状:** `REFERENCES users(id)` のみ — ユーザー削除時に FK 制約違反
- **修正:** `REFERENCES users(id) ON DELETE CASCADE` に変更

### A-3【中】projects.owner_id に ON DELETE CASCADE/SET NULL なし
- **場所:** `backend/database.py:29`
- **設計書:** TEXT FK → users
- **現状:** `REFERENCES users(id)` のみ — ユーザー削除時に FK 制約違反
- **修正:** `REFERENCES users(id) ON DELETE SET NULL` に変更（プロジェクトは残す方針）
  - ※ SET NULL にする場合は `NOT NULL` を外す必要あり。CASCADE にする場合はそのまま

### A-4【低】daily_logs.task_id に ON DELETE SET NULL なし
- **場所:** `backend/database.py:87`
- **設計書:** TEXT FK → tasks NULL
- **現状:** `TEXT REFERENCES tasks(id)` — タスク削除時に孤立 FK
- **修正:** `REFERENCES tasks(id) ON DELETE SET NULL` に変更

### A-5【低】milestones テーブルに created_at カラムなし
- **場所:** `backend/database.py:76-82`
- **設計書:** created_at の記載なし（ただし他全テーブルには存在）
- **現状:** milestones だけ作成日時を追跡不可
- **修正:** `created_at DATETIME NOT NULL DEFAULT (datetime('now'))` を追加

---

## B. API設計（DESIGN.md セクション9 vs routers/*.py）

### B-1【高】POST /api/auth/refresh（トークン更新）が未実装
- **設計書:** 9.1 — `POST /api/auth/refresh`（トークン更新）
- **実装:** `backend/routers/auth.py` — login と me のみ。refresh エンドポイントなし
- **修正:** refresh エンドポイントを追加（リフレッシュトークン発行 → 新 JWT 返却）

### B-2【高】POST /api/daily-logs/{id}/llm-summary（LLM要約生成）が未実装
- **設計書:** 9.10 — `POST /api/daily-logs/{id}/llm-summary`
- **実装:** `backend/routers/daily_logs.py` — 該当エンドポイントなし
- **修正:** LLM 要約生成のスタブエンドポイントを追加（Phase 7 想定でも API 定義は先行で作る）

### B-3【高】POST /api/projects/{id}/weekly-summaries/{week_start}/generate（LLM生成）が未実装
- **設計書:** 9.8 — `POST /api/projects/{id}/weekly-summaries/{week_start}/generate`
- **実装:** `backend/routers/daily_logs.py` — GET と PUT のみ
- **修正:** LLM 生成のスタブエンドポイントを追加

### B-4【中】GET /api/dashboard が設計書に未記載だが実装あり
- **設計書:** セクション 9 に `/api/dashboard` の記載なし
- **実装:** `backend/routers/dashboard.py` — `GET /api/dashboard` と `GET /api/dashboard/alerts`
- **対応:** 設計書に追記するか、実装の存在を文書化する（実装側は機能として妥当）

### B-5【低】WebSocket イベント「note_synced」のサーバー送信が未実装
- **設計書:** 9.15 — `note_synced`（Vault同期完了時にクライアントへ通知）
- **実装:** `backend/obsidian.py` の scan_vault 完了時に WebSocket 通知なし
- **修正:** scan_vault / watchdog の同期完了時に `manager.broadcast({"type": "note_synced", ...})` を追加

### B-6【低】WebSocket イベント「vault_tree_updated」のサーバー送信が未実装
- **設計書:** 9.15 — `vault_tree_updated`（Vaultツリー変更時）
- **実装:** ツリー変更検知後のブロードキャストなし
- **修正:** watchdog / scan_vault 後に `manager.broadcast({"type": "vault_tree_updated"})` を追加

### B-7【低】WebSocket イベント「follow_alert」のサーバー送信が未実装
- **設計書:** 9.15 — `follow_alert`（管理者向けフォローアラート）
- **実装:** ダッシュボードの alerts API はあるが、WebSocket プッシュなし
- **修正:** 日次バッチ or ダッシュボード集計時に管理者へ `follow_alert` を WS 送信

### B-8【低】WebSocket イベント「notification」（汎用通知）の送信が部分的
- **設計書:** 9.15 — `notification`（通知ベル更新用）
- **実装:** メンション時は WS 通知あるが、汎用 `notification` イベントとしての統一送信なし
- **修正:** notifications テーブルへの INSERT 後に `send_to_user(uid, {"type": "notification", ...})` を共通化

---

## C. 実装されているが設計書に未記載のエンドポイント

| エンドポイント | ファイル | 備考 |
|---|---|---|
| `GET /api/health` | `main.py:72` | ヘルスチェック — 追加は妥当 |
| `GET /api/dashboard` | `dashboard.py:21` | ダッシュボード集計 — 設計書への追記推奨 |
| `GET /api/dashboard/alerts` | `dashboard.py:149` | フォローアラート — 設計書への追記推奨 |

---

## 修正優先度

| 優先度 | 件数 | 項目 |
|--------|------|------|
| **高** | 3 | B-1, B-2, B-3（未実装エンドポイント） |
| **中** | 4 | A-1, A-2, A-3, B-4 |
| **低** | 6 | A-4, A-5, B-5, B-6, B-7, B-8 |

---

## 修正時の参照ファイル一覧

| 修正ID | 対象ファイル |
|--------|-------------|
| A-1〜A-5 | `backend/database.py` |
| B-1 | `backend/routers/auth.py`, `backend/auth.py` |
| B-2 | `backend/routers/daily_logs.py` |
| B-3 | `backend/routers/daily_logs.py` |
| B-4 | `docs/DESIGN.md`（セクション9への追記） |
| B-5, B-6 | `backend/obsidian.py` |
| B-7 | `backend/routers/dashboard.py` or 新規バッチ処理 |
| B-8 | `backend/routers/messages.py`, `backend/routers/projects.py` |
