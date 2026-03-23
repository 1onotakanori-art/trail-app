# TRAIL 監査修正計画

> **作成日:** 2026-03-22
> **入力:** `docs/AUDIT_FIXES.md` (A〜F項), `docs/AUDIT_REPORT.md`
> **方針:** コードの修正は行わない。修正項目を5カテゴリに分類し、優先度と依存関係を明記する。

---

## 実行順序の原則

```
Phase 1: DB修正 ──→ Phase 2: APIバックエンド修正 ──→ Phase 3: バックエンドロジック修正
                                                          ↓
                    Phase 5: 結合修正 ←── Phase 4: フロントエンド修正
```

- DB スキーマ変更がある場合、先に適用しないと API / ロジックのコードが動作しない
- API エンドポイントが存在しないと、フロントエンドから呼び出せない
- 結合修正はフロント・バックの両方が揃ってから行う

---

## カテゴリ 1: DB修正（テーブル/カラム追加・変更）

他のすべてのカテゴリに先立って実施する。

| # | 修正ID | 優先度 | 内容 | 対象ファイル | 依存 |
|---|--------|--------|------|-------------|------|
| 1-1 | A-1 | 中 | `task_dependencies.dep_type` に `CHECK(dep_type IN ('FS'))` 追加 | `backend/database.py:63` | なし |
| 1-2 | A-2 | 中 | `messages.user_id` に `ON DELETE CASCADE` 追加 | `backend/database.py:126` | なし |
| 1-3 | A-3 | 中 | `projects.owner_id` に `ON DELETE SET NULL` 追加（NOT NULL 解除が必要） | `backend/database.py:29` | なし |
| 1-4 | A-4 | 低 | `daily_logs.task_id` に `ON DELETE SET NULL` 追加 | `backend/database.py:87` | なし |
| 1-5 | A-5 | 低 | `milestones` テーブルに `created_at DATETIME NOT NULL DEFAULT (datetime('now'))` 追加 | `backend/database.py:76-82` | なし |
| 1-6 | R2-1 | 低 | `milestones.description` の NULL 許容について設計書と照合し、NOT NULL にするか判断 | `backend/database.py` | なし |

**合計: 6件**（中2 / 低4）
**所要見積: 1ファイルの修正 + マイグレーション確認**

---

## カテゴリ 2: API修正（エンドポイント追加・修正）

DB修正完了後に実施。フロントエンドとの結合（カテゴリ5）の前提。

| # | 修正ID | 優先度 | 内容 | 対象ファイル | 依存 |
|---|--------|--------|------|-------------|------|
| 2-1 | B-1 | **高** | `POST /api/auth/refresh` トークン更新エンドポイント追加 | `backend/routers/auth.py`, `backend/auth.py` | D-3 (JWT有効期限短縮と同時に実施) |
| 2-2 | B-2 | **高** | `POST /api/daily-logs/{id}/llm-summary` スタブ追加 | `backend/routers/daily_logs.py` | なし |
| 2-3 | B-3 | **高** | `POST /api/projects/{id}/weekly-summaries/{week_start}/generate` スタブ追加 | `backend/routers/daily_logs.py` | なし |
| 2-4 | R1-9 | 中 | ユーザープロフィール編集 API 追加（`PUT /api/users/{id}/profile`） | `backend/routers/users.py` | なし |
| 2-5 | R1-9 | 中 | パスワード変更 API 追加（`POST /api/users/{id}/change-password`） | `backend/routers/users.py` | なし |
| 2-6 | B-4 | 低 | `GET /api/dashboard`, `GET /api/dashboard/alerts` を設計書（DESIGN.md セクション9）に追記 | `docs/DESIGN.md` | なし（ドキュメント修正のみ） |

**合計: 6件**（高3 / 中2 / 低1）

---

## カテゴリ 3: バックエンドロジック修正（バグ修正・ロジック変更）

DB修正完了後、API修正と並行して実施可能。

### 3A. セキュリティ（最優先）

| # | 修正ID | 優先度 | 内容 | 対象ファイル | 依存 |
|---|--------|--------|------|-------------|------|
| 3-1 | D-1 | **高** | SQL SET 句のカラム名ホワイトリスト追加（全4ルーター） | `backend/routers/projects.py`, `tasks.py`, `milestones.py`, `users.py` | なし |
| 3-2 | D-2 | **高** | `config.py` の `secret_key` デフォルト値を除去。未設定時は起動拒否 | `backend/config.py` | なし |
| 3-3 | D-3 | **高** | JWT アクセストークン有効期限を 30日→1時間 に短縮 | `backend/config.py`, `backend/auth.py` | 2-1 (refresh API と同時実施) |

### 3B. ロジック修正

| # | 修正ID | 優先度 | 内容 | 対象ファイル | 依存 |
|---|--------|--------|------|-------------|------|
| 3-4 | D-4 | 中 | watchdog のデバウンス処理追加（同一ファイルへの高速連続変更を 1s バッチ化） | `backend/obsidian.py:318-322` | なし |
| 3-5 | D-5 | 中 | ★ファイル検索を親ディレクトリ再帰に変更（サブフォルダ内 note 対応） | `backend/obsidian.py:218-227` | なし |
| 3-6 | D-6 | 中 | `asyncio.get_event_loop()` → `asyncio.get_running_loop()` に変更 | `backend/obsidian.py:316` | なし |
| 3-7 | D-7 | 中 | `scan_vault` の `except Exception: pass` → ログ出力追加 | `backend/obsidian.py:293-298` | なし |
| 3-8 | R2-3 | 中 | 通知 body の `owner_id` → `display_name` に修正 | `backend/routers/projects.py` (通知生成箇所) | なし |
| 3-9 | R1-16 | 中 | FTS5 search_index 登録漏れ: messages 投稿時、daily_logs コメント編集時、weekly_summaries 更新時に登録追加 | `backend/routers/messages.py`, `daily_logs.py` | なし |
| 3-10 | R2-7 | 低 | チャンネル一覧のソート: `bookmarked` を「ブックマークのみ（フィルタ）」→「ブックマーク優先（並び替え）」に変更 | `backend/routers/channels.py` | なし |

### 3C. WebSocket・通信

| # | 修正ID | 優先度 | 内容 | 対象ファイル | 依存 |
|---|--------|--------|------|-------------|------|
| 3-11 | B-5 | 低 | scan_vault / watchdog 完了時に `note_synced` WS イベント送信 | `backend/obsidian.py` | なし |
| 3-12 | B-6 | 低 | watchdog / scan_vault 後に `vault_tree_updated` WS イベント送信 | `backend/obsidian.py` | なし |
| 3-13 | B-7 | 低 | 管理者向け `follow_alert` WS イベント送信 | `backend/routers/dashboard.py` or バッチ | なし |
| 3-14 | B-8 | 低 | 通知 INSERT 後の汎用 `notification` WS イベント送信を共通化 | `backend/routers/messages.py`, `projects.py` | なし |
| 3-15 | D-8 | 低 | WebSocket close 時に reason メッセージを含める | `backend/main.py:78-89` | なし |

### 3D. その他

| # | 修正ID | 優先度 | 内容 | 対象ファイル | 依存 |
|---|--------|--------|------|-------------|------|
| 3-16 | D-9 | 低 | file_hash の MD5 → SHA256 変更 | `backend/obsidian.py:160-162` | なし |
| 3-17 | R3-3 | 低 | デフォルト admin 自動作成のセキュリティ確認 → 本番時の無効化 or 初期パスワード強制変更 | `backend/main.py` | なし |
| 3-18 | R1-11 | 低 | Daily Cron（日次バッチ）の実装 — note 更新なし自動検知 | 新規ファイル or `backend/main.py` | なし |

**合計: 18件**（高3 / 中6 / 低9）

---

## カテゴリ 4: フロントエンド修正（UI/コンポーネント修正）

API が揃った後に実施（一部は API 不要のため並行可能）。

### 4A. バグ・品質（API不要 — 並行実施可能）

| # | 修正ID | 優先度 | 内容 | 対象ファイル | 依存 |
|---|--------|--------|------|-------------|------|
| 4-1 | E-1 | **高** | useWebSocket: `onMessage` を `useRef` で保持し再接続リスナーリーク修正 | `frontend/src/hooks/useWebSocket.ts` | なし |
| 4-2 | E-2 | **高** | 全 API 呼び出しに try-catch 追加（ChatTab, MainTab, ProjectsTab, GanttPopover, GanttChart, VaultExplorer） | 6ファイル | なし |
| 4-3 | E-3 | 中 | ObsidianPreview: ドラッグ中リスナーリークの cleanup | `frontend/src/components/ObsidianPreview.tsx` | なし |
| 4-4 | E-4 | 中 | GanttChart StateModal: `onClose` の `useCallback` メモ化 | `frontend/src/components/GanttChart.tsx` | なし |
| 4-5 | E-5 | 中 | DashboardTab: エラー state 追加、エラーメッセージ表示 | `frontend/src/components/tabs/DashboardTab.tsx` | なし |
| 4-6 | E-6 | 低 | ChatTab: setTimeout のクリーンアップ追加 | `frontend/src/components/tabs/ChatTab.tsx` | なし |
| 4-7 | E-7 | 低 | Header: 空 catch 節に `console.error` 追加 | `frontend/src/components/Header.tsx` | なし |

### 4B. UI設計準拠（一部は API が前提）

| # | 修正ID | 優先度 | 内容 | 対象ファイル | API依存 |
|---|--------|--------|------|-------------|---------|
| 4-8 | F-3a | **高** | ガント親タスク行に💬チャットボタン追加 → クリックで `chatChannel` セット | `GanttChart.tsx`, `MainTab.tsx` | なし |
| 4-9 | F-3b | **高** | メインタブに💬トグルボタン追加（チャットパネル開閉） | `MainTab.tsx` | なし |
| 4-10 | F-2a | 中 | 通知アイテムクリック → 該当箇所遷移（タブ切替 + スクロール） | `Header.tsx`, `App.tsx` | なし |
| 4-11 | F-4a | 中 | @メンション入力 UI 追加（ユーザー候補ドロップダウン + mentions 配列送信） | `ChatTab.tsx`, `MainTab.tsx` (ChatPanel) | なし |
| 4-12 | R1-12 | 中 | メッセージ本文内の @メンション表示ハイライト | `ChatTab.tsx` | なし |
| 4-13 | R1-13 | 中 | チャット投稿時の Obsidian リンク挿入 UI（ファイル選択→URI自動生成） | `ChatTab.tsx` | なし |
| 4-14 | F-6a | 低 | `follow_alerts` ウィジェットの `adminOnly` を `true` に変更 | `DashboardTab.tsx:25` | なし |
| 4-15 | F-2b | 低 | ユーザーメニューに「プロフィール編集」追加 → 新規 ProfileModal | `Header.tsx`, 新規コンポーネント | 2-4 (API) |
| 4-16 | F-2c | 低 | ユーザーメニューに「パスワード変更」追加 | `Header.tsx`, 新規コンポーネント | 2-5 (API) |
| 4-17 | F-9a | 低 | 週次サマリーに🤖 LLM生成ボタン追加 | `GanttChart.tsx` (WeeklySummaryRow) | 2-3 (API) |
| 4-18 | F-10 | 低 | ガントエクスポートボタン追加（html2canvas + jsPDF） | `MainTab.tsx`, 新規ロジック | なし |
| 4-19 | R1-10 | 低 | ブラウザ通知（Notification API）実装 — WS 受信時に push | `useWebSocket.ts` or 新規 hook | 3-14 (WS統一) |
| 4-20 | R2-6 | 低 | ウィジェット設定のサーバー永続化を優先に変更（localStorage をフォールバックに） | `DashboardTab.tsx` | なし |

### 4C. ガント高度機能（設計書記載だが Phase 後半）

| # | 修正ID | 優先度 | 内容 | 対象ファイル | 依存 |
|---|--------|--------|------|-------------|------|
| 4-21 | R1-5 | 低 | ガント上の依存関係ドラッグ作成（子タスクバー右端→左端） | `GanttChart.tsx` | なし |
| 4-22 | R1-6 | 低 | ガント上の依存矢印クリック→削除ボタン | `GanttChart.tsx` | なし |
| 4-23 | R1-7 | 低 | ガント上のタスクバー D&D 日程調整 | `GanttChart.tsx` | なし |
| 4-24 | R1-15 | 低 | ObsidianPreview のリサイズハンドル追加（CSS resize: both は実装済みだが、ドラッグハンドルを追加） | `ObsidianPreview.tsx` | なし |

**合計: 24件**（高4 / 中5 / 低15）

---

## カテゴリ 5: 結合修正（フロント ⇔ バック接続修正）

フロントとバックの両方が揃った後に実施。

| # | 修正ID | 優先度 | 内容 | 対象ファイル | 依存 |
|---|--------|--------|------|-------------|------|
| 5-1 | D-3 + B-1 | **高** | JWT refresh フロー結合: アクセストークン期限切れ検知 → refresh API 呼び出し → トークン再取得 | `frontend/src/api/client.ts`, `AuthContext.tsx` | 2-1, 3-3 |
| 5-2 | R2-5 | 中 | WS `note_synced` / `vault_tree_updated` 受信処理追加 → VaultExplorer の自動更新 | `useWebSocket.ts` 利用箇所, `VaultExplorer.tsx` | 3-11, 3-12 |
| 5-3 | R1-16 + 検索 | 中 | FTS5 登録完了後、検索結果クリック→遷移のE2E動作確認 | `Header.tsx`, バックエンド検索API | 3-9, 4-10 |
| 5-4 | F-9a + B-3 | 低 | 🤖 LLM生成ボタンクリック → generate API 呼び出し → サマリー表示 | `GanttChart.tsx`, `api/client.ts` | 2-3, 4-17 |
| 5-5 | F-2b/c + API | 低 | プロフィール編集/パスワード変更のフロント→API結合 | `Header.tsx`, 新規コンポーネント | 2-4, 2-5, 4-15, 4-16 |
| 5-6 | R1-10 + WS | 低 | ブラウザ通知と WS notification イベントの結合 | `useWebSocket.ts` | 3-14, 4-19 |

**合計: 6件**（高1 / 中2 / 低3）

---

## 全体サマリー

| カテゴリ | 件数 | 高 | 中 | 低 |
|----------|------|------|------|------|
| 1. DB修正 | 6 | 0 | 2 | 4 |
| 2. API修正 | 6 | 3 | 2 | 1 |
| 3. バックエンドロジック | 18 | 3 | 6 | 9 |
| 4. フロントエンド | 24 | 4 | 5 | 15 |
| 5. 結合修正 | 6 | 1 | 2 | 3 |
| **合計** | **60** | **11** | **17** | **32** |

---

## 推奨実施順序（バッチ単位）

### Batch 1: セキュリティ + 基盤（高優先度 — 最初に実施）

```
1-1〜1-3  DB 制約修正（CHECK, CASCADE）
3-1       SQLカラム名ホワイトリスト
3-2       secret_key デフォルト除去
3-3 + 2-1 JWT 有効期限短縮 + refresh API 追加（同時実施必須）
4-1       useWebSocket メモリリーク修正
4-2       API エラーハンドリング一括追加
5-1       JWT refresh フロントエンド結合
```

**依存チェーン:** 3-3 → 2-1 → 5-1（この順序は厳守）

### Batch 2: 中核 UI 修正（高優先度）

```
4-8       ガント💬チャットボタン追加
4-9       メインタブ💬トグルボタン追加
2-2, 2-3  LLM スタブ API 追加
```

**依存:** なし（独立して実施可能）

### Batch 3: ロジック修正 + UX 改善（中優先度）

```
3-4〜3-7  watchdog / obsidian.py 修正4件
3-8       通知 body の display_name 修正
3-9       FTS5 登録漏れ補完
4-3〜4-5  ObsidianPreview, StateModal, Dashboard エラー表示
4-10      通知クリック遷移
4-11〜4-12 @メンション UI + ハイライト
5-2       WS note_synced / vault_tree_updated 結合
5-3       検索結果→遷移 E2E
```

**依存チェーン:** 3-9 → 5-3（FTS登録が先）、3-11/3-12 → 5-2（WS送信が先）

### Batch 4: 低優先度（後回し可能）

```
1-4〜1-6  DB 制約残り
2-4〜2-6  プロフィール/パスワード API, 設計書追記
3-10〜3-18 WS イベント、MD5→SHA256、Cron、admin安全化 等
4-6〜4-7  setTimeout cleanup, Header catch
4-13〜4-24 Obsidianリンク挿入UI, ウィジェット永続化, ガント高度機能 等
5-4〜5-6  LLM結合, プロフィール結合, ブラウザ通知結合
```

---

## 依存関係グラフ（高・中優先度のみ）

```
[DB]                   [Backend]              [Frontend]            [結合]

1-1 A-1 CHECK ───────→ (API で dep_type 制約利用可)
1-2 A-2 CASCADE
1-3 A-3 SET NULL

                       3-1 D-1 ホワイトリスト
                       3-2 D-2 secret_key
                       3-3 D-3 JWT短縮 ──→ 2-1 B-1 refresh ──────→ 5-1 refresh結合

                       3-4 D-4 debounce
                       3-5 D-5 ★検索
                       3-6 D-6 event_loop
                       3-7 D-7 scan_vault log
                       3-8 R2-3 display_name
                       3-9 FTS5 登録 ──────────────────────────────→ 5-3 検索E2E

                       3-11 B-5 note_synced WS ────────────────────→ 5-2 WS結合
                       3-12 B-6 vault_tree WS ─────────────────────↗

                                               4-1 E-1 useWS
                                               4-2 E-2 try-catch
                                               4-3 E-3 Preview leak
                                               4-4 E-4 StateModal
                                               4-5 E-5 Dashboard err
                                               4-8 F-3a 💬ボタン
                                               4-9 F-3b トグル
                                               4-10 F-2a 通知遷移
                                               4-11 F-4a メンション

                       2-3 B-3 generate stub ─→ 4-17 F-9a LLMボタン → 5-4 LLM結合
                       2-4 profile API ────────→ 4-15 F-2b 編集UI ──→ 5-5 結合
                       2-5 password API ───────→ 4-16 F-2c 変更UI ──↗
```

---

## 除外事項（対応不要 or 許容）

| 項目 | 理由 |
|------|------|
| D-10 vault preview パストラバーサル | resolve() + relative_to で対策済み。問題なし |
| GanttPopover の表示方法（hover→click） | UX 判断として許容。クリックの方が実用的 |
| VaultExplorer プレビュー方式 | 同上 |
| R3-6 QuickAddModal に Feeling フィールド | 設計書の「最小限」の拡張として妥当 |
| R3-5 State/Feeling 変更モーダル | 設計書 6.10 の意図に合致。具体仕様がないだけ |
| R3-7 WebSocket ping/pong | 接続維持用。仕様追記のみでコード変更不要 |
