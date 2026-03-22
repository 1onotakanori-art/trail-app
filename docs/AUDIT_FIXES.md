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

---

## D. バックエンド — セキュリティ・バグ

### D-1【高】SQLインジェクション — 動的 SET 句のカラム名がバリデーション不足
- **場所:** `backend/routers/projects.py:253-255`, `tasks.py:110-112`, `milestones.py:65-67`, `users.py:86-88`
- **問題:** `updates` dict のキーを f-string で SQL に埋め込んでいる:
  ```python
  set_clause = ", ".join(f"{k} = ?" for k in updates)
  await db.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)
  ```
  キーは Pydantic モデルのフィールド名から来るため、通常の API 呼び出しでは安全。
  しかし、Pydantic v2 の `model_dump()` が extra fields を許容する設定の場合、
  攻撃者が任意のカラム名（例: `password_hash`）を注入できる可能性がある。
- **現状リスク:** Pydantic BaseModel はデフォルトで extra="ignore" のため**即座の脆弱性はない**。
  ただし防御的プログラミングとして許可カラムのホワイトリストを設けるべき。
- **修正案:** 各 update 関数で `ALLOWED_FIELDS` セットを定義し、キーをフィルタリング:
  ```python
  ALLOWED = {"name", "owner_id", "state", "feeling", ...}
  updates = {k: v for k, v in updates.items() if k in ALLOWED}
  ```

### D-2【高】config.py のデフォルト secret_key がハードコード
- **場所:** `backend/config.py:5`
- **問題:** `secret_key: str = "dev-secret-key-change-in-production"` — 本番で .env を設定し忘れると全 JWT が予測可能
- **修正案:** デフォルト値を除去し、環境変数未設定時はアプリ起動を拒否:
  ```python
  secret_key: str  # no default — .env required
  ```
  または起動時にチェックを追加

### D-3【高】JWT トークンに有効期限が 30 日 — refresh なしでは危険
- **場所:** `backend/config.py:10`, `backend/auth.py:30-33`
- **問題:** アクセストークンが 30 日間有効。refresh エンドポイント (B-1) もないため、トークン漏洩時の無効化手段がない
- **修正案:**
  1. アクセストークンを 15 分〜1 時間に短縮
  2. B-1 の refresh エンドポイントを実装
  3. refresh_token は HttpOnly Cookie で管理

### D-4【中】watchdog — 高速連続変更でのレースコンディション
- **場所:** `backend/obsidian.py:318-322`
- **問題:** `_handle()` 内で `asyncio.run_coroutine_threadsafe()` を呼んでいるが、同一ファイルに対する高速連続変更（エディタの自動保存等）で `sync_note_file` が並行実行され、DB に重複レコードが発生する可能性
  ```python
  def _handle(self, path: str):
      if not path.endswith(".md"):
          return
      asyncio.run_coroutine_threadsafe(
          sync_note_file(Path(path), db_path), self._loop
      )
  ```
- **修正案:** デバウンス処理を追加（同じパスへの変更通知を 500ms〜1s 以内にバッチ化）:
  ```python
  def _handle(self, path: str):
      if not path.endswith(".md"):
          return
      self._pending[path] = time.time()
      # debounce: schedule after 1s
  ```

### D-5【中】watchdog — ★ファイルの project_id 判定が親ディレクトリのみ
- **場所:** `backend/obsidian.py:218-227`
- **問題:** note ファイルの `note_path.parent` にある★ファイルのみを検索。サブフォルダに note がある場合（例: `200_Projects/20260322_業務/sub/note.md`）、★ファイルが見つからない
  ```python
  project_folder = note_path.parent
  star_files = list(project_folder.glob("★*.md"))
  ```
- **修正案:** 親ディレクトリを再帰的に遡って★ファイルを探索:
  ```python
  folder = note_path.parent
  while folder != projects_dir.parent:
      star_files = list(folder.glob("★*.md"))
      if star_files:
          break
      folder = folder.parent
  ```

### D-6【中】watchdog — `asyncio.get_event_loop()` は非推奨
- **場所:** `backend/obsidian.py:316`
- **問題:** Python 3.10+ では `asyncio.get_event_loop()` はメインスレッド以外で DeprecationWarning。watchdog はスレッドから呼ばれるため問題が起きる可能性
- **修正案:** `start_watcher` で `loop = asyncio.get_running_loop()` を取得しクロージャで渡す:
  ```python
  async def start_watcher(db_path: str):
      loop = asyncio.get_running_loop()
      class VaultHandler(FileSystemEventHandler):
          def __init__(self):
              self._loop = loop
  ```

### D-7【中】scan_vault — 例外の完全無視
- **場所:** `backend/obsidian.py:293-298`
- **問題:** `except Exception: pass` で全エラーを無視。パーミッション問題やDB接続エラーも黙殺される
  ```python
  for md_file in projects_dir.rglob("*.md"):
      try:
          await sync_note_file(md_file, db_path)
          count += 1
      except Exception:
          pass
  ```
- **修正案:** ログ出力を追加し、エラーカウントも返す

### D-8【低】WebSocket — 接続認証失敗時のエラー情報不足
- **場所:** `backend/main.py:78-89`
- **問題:** JWT デコード失敗時に code=4001 で close するが、クライアントにエラー理由が伝わらない
- **修正案:** close reason にメッセージを含める:
  ```python
  await websocket.close(code=4001, reason="Invalid token")
  ```

### D-9【低】obsidian.py — file_hash に MD5 使用
- **場所:** `backend/obsidian.py:160-162`
- **問題:** MD5 はセキュリティ用途では非推奨。ここでは変更検知のみなので実害はないが、SHA256 に統一が望ましい
- **修正案:** `hashlib.sha256()` に変更

### D-10【低】vault preview にパストラバーサル対策があるが、シンボリックリンク未考慮
- **場所:** `backend/routers/vault.py:55-57`
- **問題:** `full_path.resolve().relative_to(vault.resolve())` でパストラバーサルを防いでいるが、Vault 内にシンボリックリンクがある場合、resolve() が Vault 外を指す可能性
- **現状:** 対策済み（resolve() が実パスに解決するため relative_to で弾ける）。**問題なし**

---

## E. フロントエンド — バグ・品質問題

### E-1【高】useWebSocket — 再接続時のメモリリーク
- **場所:** `frontend/src/hooks/useWebSocket.ts:28-35`
- **問題:** `onclose` ハンドラで `setTimeout(connect, 3000)` を呼び再接続するが、新しい WebSocket が作られる度に古い WS オブジェクトへのイベントリスナーが蓄積する。
  また `onMessage` コールバックが変わるたびに `connect` が再生成され、useEffect が WebSocket を閉じて再接続する。Header.tsx 等で `useWebSocket` を使う際にコールバック依存で不要な再接続が頻発する可能性。
- **修正案:**
  1. `onMessage` を `useRef` で保持し、`connect` の依存から除外
  2. 再接続時に古い WS を明示的に close してから新しい WS を作成
  ```typescript
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage
  const connect = useCallback(() => {
    wsRef.current?.close()
    const ws = new WebSocket(...)
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      onMessageRef.current(data)
    }
    // ...
  }, [token]) // onMessage removed from deps
  ```

### E-2【高】API 呼び出しのエラーハンドリング欠如 — 全体的
- **場所:** 以下のファイルの全 API 呼び出し箇所
  - `frontend/src/components/tabs/ChatTab.tsx:28-31, 35-39, 61-70`
  - `frontend/src/components/tabs/MainTab.tsx:36-41` (ChatPanel send)
  - `frontend/src/components/tabs/ProjectsTab.tsx:309-332` (TaskManagementModal)
  - `frontend/src/components/GanttPopover.tsx:36-39, 94-98`
  - `frontend/src/components/GanttChart.tsx:78-82`
  - `frontend/src/components/VaultExplorer.tsx:29-34`
- **問題:** `await api.xxx()` が try-catch なしで呼ばれている。失敗時に:
  - ユーザーにエラーが表示されない
  - input がクリアされ入力内容が消失（ChatTab, MainTab）
  - loading 状態がスタック（ProjectsTab）
  - モーダルが閉じてしまい状態不整合（GanttPopover, GanttChart）
- **修正案:** 共通のエラーハンドリングラッパーまたは各箇所に try-catch を追加:
  ```typescript
  const send = async () => {
    if (!input.trim() || !channel) return
    try {
      await messagesApi.post(channel.id, { content: input.trim(), tag: tag || undefined })
      setInput('')
      loadMessages()
    } catch (e) {
      console.error('メッセージ送信失敗', e)
      // toast or error state
    }
  }
  ```

### E-3【中】ObsidianPreview — ドラッグ中のアンマウントでリスナーリーク
- **場所:** `frontend/src/components/ObsidianPreview.tsx:28-34`
- **問題:** `startDrag` で `window.addEventListener('mousemove', onMove)` を追加するが、コンポーネントがアンマウントされてもドラッグ中のリスナーは残り続ける
- **修正案:** `useEffect` のクリーンアップで、ドラッグ中なら強制的にリスナーを除去:
  ```typescript
  useEffect(() => {
    return () => {
      // force cleanup if dragging
      dragging.current = false
    }
  }, [])
  ```
  または、リスナーの参照を ref に保持してクリーンアップで除去

### E-4【中】GanttChart StateModal — onClose の参照不安定
- **場所:** `frontend/src/components/GanttChart.tsx:327-331`
- **問題:** `StateModal` の useEffect が `[onClose]` に依存しているが、`onClose` は親の render ごとに新しい関数参照になるため、mousedown リスナーが毎レンダーで付け替えられる
- **修正案:** 親で `onClose` を `useCallback` でメモ化、または StateModal 内で `useRef` を使う

### E-5【中】DashboardTab — エラー時に空ダッシュボード表示
- **場所:** `frontend/src/components/tabs/DashboardTab.tsx:87-93`
- **問題:** catch 節で `setLoading(false)` のみ実行。data が null のまま空ダッシュボードが表示される
- **修正案:** エラー state を追加し、エラーメッセージを表示:
  ```typescript
  } catch (e) {
    setError('ダッシュボードの読み込みに失敗しました')
    setLoading(false)
  }
  ```

### E-6【低】ChatTab — setTimeout のクリーンアップなし
- **場所:** `frontend/src/components/tabs/ChatTab.tsx:38`
- **問題:** `loadMessages` 内の `setTimeout(() => messagesEndRef.current?.scrollIntoView(...), 100)` がクリーンアップされない。アンマウント後に実行される可能性（実害は小さい）
- **修正案:** setTimeout の ID を ref に保持し、クリーンアップで clearTimeout

### E-7【低】Header — 全 catch 節が空
- **場所:** `frontend/src/components/Header.tsx:22-26, 29-34, 58-66`
- **問題:** `loadUnreadCount`, `loadNotifications`, `handleSearch` の catch 節がすべて空。サイレントエラー
- **修正案:** 最低限 `console.error` を追加。重要な箇所はユーザーへのフィードバックも追加

---

## 修正優先度（全体）

| 優先度 | ID | カテゴリ | 概要 |
|--------|-----|----------|------|
| **高** | D-1 | セキュリティ | SQL SET 句のカラム名ホワイトリスト未適用 |
| **高** | D-2 | セキュリティ | secret_key のハードコードデフォルト |
| **高** | D-3 | セキュリティ | JWT 有効期限 30 日 + refresh なし |
| **高** | E-1 | メモリリーク | useWebSocket 再接続時のリスナー蓄積 |
| **高** | E-2 | エラーハンドリング | API 呼び出し全般の try-catch 欠如 |
| **高** | B-1 | 未実装 API | POST /api/auth/refresh |
| **高** | B-2 | 未実装 API | POST /api/daily-logs/{id}/llm-summary |
| **高** | B-3 | 未実装 API | POST .../weekly-summaries/.../generate |
| **中** | D-4 | レースコンディション | watchdog 高速連続変更でのデバウンスなし |
| **中** | D-5 | ロジック不備 | ★ファイル検索がサブフォルダ未対応 |
| **中** | D-6 | 非推奨 API | asyncio.get_event_loop() の使用 |
| **中** | D-7 | エラー処理 | scan_vault の例外完全無視 |
| **中** | A-1 | DB 制約 | dep_type CHECK なし |
| **中** | A-2 | DB 制約 | messages.user_id CASCADE なし |
| **中** | A-3 | DB 制約 | projects.owner_id CASCADE なし |
| **中** | B-4 | 設計書整合 | dashboard API 未記載 |
| **中** | E-3 | メモリリーク | ObsidianPreview ドラッグリスナー |
| **中** | E-4 | 不要な再レンダー | StateModal onClose 参照不安定 |
| **中** | E-5 | UX | DashboardTab エラー時の空表示 |
| **低** | D-8 | WS | 認証失敗時のエラー理由不足 |
| **低** | D-9 | ハッシュ | MD5 → SHA256 推奨 |
| **低** | A-4 | DB 制約 | daily_logs.task_id ON DELETE SET NULL |
| **低** | A-5 | DB 一貫性 | milestones.created_at なし |
| **低** | B-5〜B-8 | WS イベント | 未実装 WS イベント 4 件 |
| **低** | E-6 | クリーンアップ | ChatTab setTimeout |
| **低** | E-7 | エラー処理 | Header 空 catch |

---

## 修正時の参照ファイル一覧

| 修正ID | 対象ファイル |
|--------|-------------|
| A-1〜A-5 | `backend/database.py` |
| B-1 | `backend/routers/auth.py`, `backend/auth.py` |
| B-2, B-3 | `backend/routers/daily_logs.py` |
| B-4 | `docs/DESIGN.md`（セクション9への追記） |
| B-5, B-6 | `backend/obsidian.py` |
| B-7 | `backend/routers/dashboard.py` or 新規バッチ処理 |
| B-8 | `backend/routers/messages.py`, `backend/routers/projects.py` |
| D-1 | `backend/routers/projects.py`, `tasks.py`, `milestones.py`, `users.py` |
| D-2, D-3 | `backend/config.py`, `backend/auth.py` |
| D-4〜D-7 | `backend/obsidian.py` |
| D-8 | `backend/main.py` |
| D-9 | `backend/obsidian.py` |
| D-10 | 対応不要 |
| E-1 | `frontend/src/hooks/useWebSocket.ts` |
| E-2 | `frontend/src/components/tabs/ChatTab.tsx`, `MainTab.tsx`, `ProjectsTab.tsx`, `GanttPopover.tsx`, `GanttChart.tsx`, `VaultExplorer.tsx` |
| E-3 | `frontend/src/components/ObsidianPreview.tsx` |
| E-4 | `frontend/src/components/GanttChart.tsx` |
| E-5 | `frontend/src/components/tabs/DashboardTab.tsx` |
| E-6 | `frontend/src/components/tabs/ChatTab.tsx` |
| E-7 | `frontend/src/components/Header.tsx` |
