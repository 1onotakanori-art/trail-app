# TRAIL 監査修正ログ

> **最終更新:** 2026-03-22
> **入力:** `docs/AUDIT_FIX_PLAN.md` の全60項目

---

## カテゴリ 1: DB修正（6件 → 全件完了）

| # | 修正内容 | 対象ファイル | 状態 |
|---|----------|-------------|------|
| 1-1 | `task_dependencies.dep_type` に `CHECK(dep_type IN ('FS'))` 追加 | `backend/database.py` | ✅ |
| 1-2 | `messages.user_id` に `ON DELETE CASCADE` 追加 | `backend/database.py` | ✅ |
| 1-3 | `projects.owner_id` を NULL許容 + `ON DELETE SET NULL` | `backend/database.py` | ✅ |
| 1-4 | `daily_logs.task_id` に `ON DELETE SET NULL` 追加 | `backend/database.py` | ✅ |
| 1-5 | `milestones` に `created_at` カラム追加 + マイグレーション | `backend/database.py` | ✅ |
| 1-6 | `milestones.description` を `NOT NULL DEFAULT ''` に変更 | `backend/database.py` | ✅ |

---

## カテゴリ 2: API修正（6件 → 全件完了）

| # | 修正内容 | 対象ファイル | 状態 |
|---|----------|-------------|------|
| 2-1 | `POST /api/auth/refresh` エンドポイント追加 | `backend/routers/auth.py`, `backend/auth.py` | ✅ |
| 2-2 | `POST /api/daily-logs/{id}/llm-summary` スタブ追加 | `backend/routers/daily_logs.py` | ✅ |
| 2-3 | `POST /api/projects/{id}/weekly-summaries/{week_start}/generate` スタブ追加 | `backend/routers/daily_logs.py` | ✅ |
| 2-4 | `PUT /api/users/{id}/profile` プロフィール編集API追加 | `backend/routers/users.py` | ✅ |
| 2-5 | `POST /api/users/{id}/change-password` パスワード変更API追加 | `backend/routers/users.py` | ✅ |
| 2-6 | DESIGN.md セクション9にダッシュボードAPI追記 | `docs/DESIGN.md` | ✅ |

---

## カテゴリ 3: バックエンドロジック修正（18件 → 全件完了）

### 3A. セキュリティ

| # | 修正内容 | 対象ファイル | 状態 |
|---|----------|-------------|------|
| 3-1 | SQL SET句カラム名ホワイトリスト（4ルーター） | `projects.py`, `tasks.py`, `milestones.py`, `users.py` | ✅ |
| 3-2 | `secret_key` デフォルト値除去、未設定時起動拒否 | `backend/config.py` | ✅ |
| 3-3 | JWTアクセストークン有効期限 30日→1時間 + リフレッシュトークン30日 | `backend/config.py`, `backend/auth.py` | ✅ |

### 3B. ロジック修正

| # | 修正内容 | 対象ファイル | 状態 |
|---|----------|-------------|------|
| 3-4 | watchdogデバウンス処理追加（1秒） | `backend/obsidian.py` | ✅ |
| 3-5 | ★ファイル検索を親ディレクトリ再帰に変更 | `backend/obsidian.py` | ✅ |
| 3-6 | `asyncio.get_event_loop()` → `asyncio.get_running_loop()` | `backend/obsidian.py` | ✅ |
| 3-7 | `scan_vault` の空 except → logger.warning | `backend/obsidian.py` | ✅ |
| 3-8 | 通知bodyの `owner_id` → `display_name` 修正 | `backend/routers/projects.py` | ✅ |
| 3-9 | FTS5 search_index 登録漏れ補完（messages, daily_logs, weekly_summaries） | `backend/routers/daily_logs.py` | ✅ |
| 3-10 | チャンネル一覧ソートの `pattern=` 修正 | `backend/routers/channels.py` | ✅ |

### 3C. WebSocket・通信

| # | 修正内容 | 対象ファイル | 状態 |
|---|----------|-------------|------|
| 3-11 | `note_synced` WSイベント送信 | `backend/obsidian.py` | ✅ |
| 3-12 | `vault_tree_updated` WSイベント送信 | `backend/obsidian.py` | ✅ |
| 3-13 | `follow_alert` WSイベント送信 | `backend/main.py` | ✅ |
| 3-14 | 汎用 `notification` WSイベント共通化 | `backend/routers/messages.py`, `projects.py` | ✅ |
| 3-15 | WebSocket close時のreasonメッセージ追加 | `backend/main.py` | ✅ |

### 3D. その他

| # | 修正内容 | 対象ファイル | 状態 |
|---|----------|-------------|------|
| 3-16 | file_hash MD5 → SHA256 | `backend/obsidian.py` | ✅ |
| 3-17 | admin自動作成の本番無効化（`TRAIL_DISABLE_SEED_ADMIN`） | `backend/main.py` | ✅ |
| 3-18 | Daily Cron（日次バッチ）実装 | `backend/main.py` | ✅ |

---

## カテゴリ 4: フロントエンド修正（24件 → 全件完了）

### 4A. バグ・品質

| # | 修正内容 | 対象ファイル | 状態 |
|---|----------|-------------|------|
| 4-1 | useWebSocket `onMessage` を `useRef` で保持 | `useWebSocket.ts` | ✅ |
| 4-2 | 全API呼び出しにtry-catch追加（6コンポーネント） | ChatTab, MainTab, ProjectsTab, GanttPopover, GanttChart, VaultExplorer | ✅ |
| 4-3 | ObsidianPreview ドラッグリスナーcleanup | `ObsidianPreview.tsx` | ✅ |
| 4-4 | GanttChart StateModal `onClose` useCallback メモ化 | `GanttChart.tsx` | ✅ |
| 4-5 | DashboardTab エラーstate + リトライボタン | `DashboardTab.tsx` | ✅ |
| 4-6 | ChatTab setTimeout クリーンアップ | `ChatTab.tsx` | ✅ |
| 4-7 | Header 空catch → console.error | `Header.tsx` | ✅ |

### 4B. UI設計準拠

| # | 修正内容 | 対象ファイル | 状態 |
|---|----------|-------------|------|
| 4-8 | ガント親タスク行に💬チャットボタン追加 | `GanttChart.tsx`, `MainTab.tsx` | ✅ |
| 4-9 | メインタブに💬トグルボタン追加（チャットパネル開閉） | `MainTab.tsx` | ✅ |
| 4-10 | 通知アイテムクリック → 該当箇所遷移 + 自動既読 | `Header.tsx` | ✅ |
| 4-11 | @メンション入力UI（ユーザー候補ドロップダウン） | `ChatTab.tsx` | ✅ |
| 4-12 | メッセージ本文内 @メンション表示ハイライト | `ChatTab.tsx` | ✅ |
| 4-13 | Obsidianリンク挿入UI（ファイル選択モーダル） | `ChatTab.tsx` | ✅ |
| 4-14 | `follow_alerts` ウィジェット `adminOnly: true` | `DashboardTab.tsx` | ✅ |
| 4-15 | プロフィール編集モーダル（ProfileModal） | `Header.tsx` | ✅ |
| 4-16 | パスワード変更モーダル（PasswordModal） | `Header.tsx` | ✅ |
| 4-17 | 週次サマリーに🤖 LLM生成ボタン追加 | `GanttChart.tsx` | ✅ |
| 4-18 | ガントエクスポートボタン追加（プレースホルダー） | `MainTab.tsx` | ✅ |
| 4-19 | ブラウザ通知（Notification API）実装 | `useWebSocket.ts` | ✅ |
| 4-20 | ウィジェット設定のサーバー永続化優先 | `DashboardTab.tsx` | ✅ |

### 4C. ガント高度機能

| # | 修正内容 | 対象ファイル | 状態 |
|---|----------|-------------|------|
| 4-21 | ガント依存関係ドラッグ作成（タスクバーD&D） | `GanttChart.tsx` | ✅ |
| 4-22 | ガント依存矢印クリック → 削除確認 | `GanttChart.tsx` | ✅ |
| 4-23 | ガントタスクバーD&D日程調整 | `GanttChart.tsx` | ✅ |
| 4-24 | ObsidianPreview リサイズハンドル追加 | `ObsidianPreview.tsx` | ✅ |

---

## カテゴリ 5: 結合修正（6件 → 全件完了）

| # | 修正内容 | 対象ファイル | 状態 |
|---|----------|-------------|------|
| 5-1 | JWT refreshフロー結合（401検知 → refresh → リトライ） | `api/client.ts`, `AuthContext.tsx` | ✅ |
| 5-2 | WS `note_synced`/`vault_tree_updated` → VaultExplorer自動更新 | `VaultExplorer.tsx` | ✅ |
| 5-3 | FTS5検索結果クリック → 遷移（Header `onNavigate`連携） | `Header.tsx` | ✅ |
| 5-4 | 🤖 LLM生成ボタン → `generateWeekly` API呼び出し | `GanttChart.tsx`, `api/client.ts` | ✅ |
| 5-5 | プロフィール/パスワードモーダル → 専用API結合 | `Header.tsx`, `api/client.ts` | ✅ |
| 5-6 | ブラウザ通知 + WS notificationイベント結合 | `useWebSocket.ts` | ✅ |

---

## 統計

| カテゴリ | 計画数 | 完了数 | 完了率 |
|----------|--------|--------|--------|
| 1. DB修正 | 6 | 6 | 100% |
| 2. API修正 | 6 | 6 | 100% |
| 3. バックエンドロジック | 18 | 18 | 100% |
| 4. フロントエンド | 24 | 24 | 100% |
| 5. 結合修正 | 6 | 6 | 100% |
| **合計** | **60** | **60** | **100%** |
