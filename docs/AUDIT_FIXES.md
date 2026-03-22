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

---

## F. UI設計（DESIGN.md セクション7 vs React コンポーネント）

### F-1 4タブ構成 — OK
- **設計書 7.1:** メイン / チャット / プロジェクト管理 / ダッシュボード
- **実装:** `App.tsx:15-20` — `TABS` 配列で4タブ定義、`renderTab()` で切り替え
- **判定: 完全一致**

### F-2 ヘッダーバー — ほぼ OK（2点不足）
- **設計書 7.2:** ロゴ / 横断検索 / 通知ベル(バッジ+ドロップダウン) / クイック登録(＋) / ユーザーメニュー
- **実装:** `Header.tsx` — 全要素実装済み
- **検索結果のカテゴリ別グルーピング:** 実装済み（message/project/note の3グループ）
- **通知ドロップダウンのクリック遷移:** 通知アイテムに `onClick` ハンドラなし
- **ユーザーメニューの「プロフィール編集」「パスワード変更」:** 未実装（ログアウトのみ）

| 項目 | 設計書 | 実装 | 判定 |
|------|--------|------|------|
| ロゴ「TRAIL」 | ✓ | `Header.tsx:80` | OK |
| 横断検索バー | ✓ | `Header.tsx:83-116` | OK |
| 検索結果カテゴリ別 | ✓ | `Header.tsx:98-113` | OK |
| 通知ベル + バッジ | ✓ | `Header.tsx:120-148` | OK |
| 通知「すべて既読」 | ✓ | `Header.tsx:129` | OK |
| 通知クリック→遷移 | ✓ | 未実装 | **F-2a 不足** |
| クイック登録(＋) | ✓ | `Header.tsx:151-153` | OK |
| ユーザーメニュー表示名 | ✓ | `Header.tsx:157-159` | OK |
| プロフィール編集 | ✓ | 未実装 | **F-2b 不足** |
| パスワード変更 | ✓ | 未実装 | **F-2c 不足** |
| ログアウト | ✓ | `Header.tsx:168` | OK |

### F-3 メインタブの3パネル構成 — ほぼ OK（1点不足）

#### Vaultエクスプローラー（左パネル）
- **設計書 7.3:** トグル開閉(デフォルト閉) / ファイルツリー / マウスオーバープレビュー / クリック→Obsidian起動
- **実装:** `MainTab.tsx:85,109,115-120` + `VaultExplorer.tsx`
- **トグルボタン:** `📂 Vault` ボタンで開閉。デフォルト閉 (`useState(false)`) → OK
- **ファイルツリー:** `VaultExplorer.tsx:57-121` — TreeNode で階層表示 → OK
- **マウスオーバープレビュー:** `VaultExplorer.tsx:107-113` — hover 時に👁ボタン表示、**クリック**でプレビュー → **差異: 設計書は「マウスオーバー → 吹き出し」だが、実装は「ホバーでボタン表示 → クリックでフローティングウィンドウ」。マウスオーバーだけで自動プレビューにはなっていない**
- **Obsidian起動:** `VaultExplorer.tsx:69` — `obsidian://` URI scheme → OK

#### ガントチャート（中央）
- **設計書 7.3:** パネル開閉に応じて幅自動調整 / チャットボタン
- **実装:** `MainTab.tsx:143-150` — flex:1 で自動調整 → OK
- **💬チャットボタン:** 未実装。設計書では「ガント上の💬ボタンクリック → チャットパネル表示」だが、GanttChart コンポーネントにチャットボタンなし → **F-3a 不足**

#### チャットパネル（右パネル）
- **設計書 7.3:** トグルボタンまたはガント💬で開閉 / プロジェクトスレッド表示 / ×で閉じる
- **実装:** `MainTab.tsx:154-156` — `ChatPanel` コンポーネント
- **トグルボタン（💬アイコン）:** 未実装。`chatChannel` は state として存在するが、セットする UI がない（ガントの💬ボタンもなし）→ **F-3b 不足: チャットパネルを開く手段がない**

### F-4 チャットタブ — ほぼ OK（1点不足）

| 項目 | 設計書 | 実装 | 判定 |
|------|--------|------|------|
| スレッド一覧（左） | ✓ | `ChatTab.tsx:91-141` | OK |
| 並び替え(4種) | ✓ | `ChatTab.tsx:93-102` | OK |
| フィルタ(★BM) | ✓ | `ChatTab.tsx:103-108` | OK — ただし「未読ありのみ」フィルタは未実装 |
| 各スレッド: 名前/プレビュー/時刻/未読マーク | ✓ | `ChatTab.tsx:111-139` | OK |
| ★ブックマークON/OFF | ✓ | `ChatTab.tsx:121-125` | OK |
| メッセージ一覧（右） | ✓ | `ChatTab.tsx:150-202` | OK |
| タグ(報告/連絡/相談) | ✓ | `ChatTab.tsx:154-158` | OK |
| リアクション表示+追加 | ✓ | `ChatTab.tsx:175-199` | OK |
| Obsidianリンク → プレビュー | ✓ | `ChatTab.tsx:163-174` + ObsidianPreview | OK |
| @メンション入力UI | ✓ | 未実装 | **F-4a 不足** |

**F-4a【中】@メンション入力 UI が未実装**
- **設計書 7.4:** メッセージ投稿時に@メンションが可能
- **実装:** `MessageCreate` スキーマに `mentions: list[str]` フィールドはあるが、フロントエンドにメンション選択UIなし。テキスト入力のみで、mentions 配列は常に空で送信される

### F-5 プロジェクト管理タブ — OK

| 項目 | 設計書 7.5 | 実装 | 判定 |
|------|--------|------|------|
| カード形式一覧 | ✓ | `ProjectsTab.tsx:68-77` + `ProjectCard` | OK |
| 表示切替(Active/Archived/All) | ✓ | `ProjectsTab.tsx:46-51` | OK |
| フィルタ(担当者/タグ) | ✓ | `ProjectsTab.tsx:53-60` | OK |
| 各カード: ID/名前/担当/期間/State/Feeling/タグ | ✓ | `ProjectCard` | OK |
| Box/Obsidianリンク | ✓ | `ProjectCard:152-154` | OK |
| [編集] → モーダル | ✓ | `ProjectFormModal` | OK |
| [子タスク管理] → モーダル | ✓ | `TaskManagementModal` | OK |
| [クローズ] → モーダル | ✓ | `CloseModal` | OK |
| [＋新規登録] → 全項目フォーム | ✓ | `ProjectFormModal` (isEdit=false) | OK |

### F-6 ダッシュボード — ほぼ OK（1点差異）

| 項目 | 設計書 7.6 | 実装 | 判定 |
|------|--------|------|------|
| 未読メッセージウィジェット | ✓ | `UnreadWidget` | OK |
| 要確認アラートウィジェット | ✓ | `AlertsWidget` | OK |
| 今週のマイルストーンウィジェット | ✓ | `MilestonesWidget` | OK |
| 自分の業務一覧ウィジェット | ✓ | `MyProjectsWidget` | OK |
| ガント俯瞰ウィジェット | ✓ | `MiniGanttWidget` | OK |
| 最近更新されたnoteウィジェット | ✓ | `RecentNotesWidget` | OK |
| ⚙ ウィジェット設定ボタン | ✓ | `DashboardTab.tsx:110` | OK |
| ON/OFF切替 | ✓ | `WidgetSettings:429-430` チェックボックス | OK |
| ドラッグ並び替え | ✓ | `WidgetSettings:418-421` drag イベント | OK |
| 設定をuser_settingsに保存 | ✓ | `DashboardTab.tsx:84` `usersApi.updateSettings` | OK |
| デフォルト: 管理者ON / メンバーOFF | 設計書: follow_alerts, mini_gantt が管理者デフォルト | `ALL_WIDGETS:26` `adminOnly: false` | **F-6a 差異** |

**F-6a【低】follow_alerts（要確認アラート）のデフォルト表示が設計書と不一致**
- **設計書:** 「管理者ON / メンバーOFF」
- **実装:** `ALL_WIDGETS` で `adminOnly: false`（全員ON）
- **修正:** `adminOnly: true` に変更（mini_gantt と同様）

### F-7 GanttPopover 親/子タスク切り替え — OK

| 項目 | 設計書 6.8 | 実装 | 判定 |
|------|--------|------|------|
| 親タスク吹き出し: noteリスト + コメント | ✓ | `ParentPopover` | OK |
| 子タスク吹き出し: 進捗度スライダー(6段階スナップ) | ✓ | `ChildPopover` | OK |
| 親: noteの🔗クリック→Obsidian起動 | ✓ | `ParentPopover:50` | OK |
| 親: コメント追加/編集 | ✓ | `ParentPopover:54-65` | OK |
| 子: スライダー+ボタン(0/20/40/60/80/100) | ✓ | `ChildPopover:111-130` | OK |
| 親/子の自動切り替え | ✓ | `GanttChart.tsx:239-256` type による分岐 | OK |

**補足:** 設計書では「マウスオーバーで表示」だが、実装は「クリックで表示」（`handleCellClick`）。UX判断として許容可能だが、設計書の厳密な意図とは差異あり。

### F-8 ObsidianPreviewウィンドウ — OK

| 項目 | 設計書 7.4/8.7 | 実装 | 判定 |
|------|--------|------|------|
| フローティングウィンドウ | ✓ | `ObsidianPreview.tsx` position:fixed | OK |
| ドラッグ移動 | ✓ | `startDrag` ハンドラ | OK |
| リサイズ可能 | ✓ | CSS `resize: 'both'` | OK |
| Markdown→HTML表示 | ✓ | iframe + srcDoc | OK |
| スクロール閲覧 | ✓ | overflowY: auto | OK |
| 🔗ボタン→Obsidian起動 | ✓ | `ObsidianPreview.tsx:57` | OK |
| ×閉じるボタン | ✓ | `ObsidianPreview.tsx:58` | OK |

### F-9 週次サマリー — ほぼ OK（1点不足）
- **設計書 6.9:** 業務展開時にガント下部に表示 / 週タブ / 手動入力 / LLM生成ボタン / noteリンク
- **実装:** `GanttChart.tsx:192-194` — `WeeklySummaryRow`
- **週タブ切り替え:** OK (`WeeklySummaryRow:396-406`)
- **手動入力(✏ 編集):** OK (`WeeklySummaryRow:439`)
- **noteリンク表示:** OK (`WeeklySummaryRow:426-437`)
- **🤖 LLM生成ボタン:** 未実装 → **F-9a 不足**（B-3のAPI未実装と対応）

### F-10 ガントエクスポート機能 — 未実装
- **設計書 6.13:** ヘッダーの表示切替エリアに「エクスポート」ボタン → PNG/PDF出力
- **実装:** MainTab のツールバーにエクスポートボタンなし
- **判定:** **F-10 未実装**（Phase 3の後半機能として優先度は低い）

---

## F. 問題サマリー

### 要対応

| # | 問題 | 重要度 |
|---|------|--------|
| F-2a | 通知クリック→該当箇所への遷移が未実装 | **中** |
| F-2b | ユーザーメニュー「プロフィール編集」が未実装 | **低** |
| F-2c | ユーザーメニュー「パスワード変更」が未実装 | **低** |
| F-3a | ガントチャート上の💬チャットボタンが未実装 | **高** |
| F-3b | メインタブのチャットパネルを開く手段がない（💬トグルボタンなし） | **高** |
| F-4a | @メンション入力UIが未実装（API側は対応済み） | **中** |
| F-6a | follow_alerts の adminOnly が false（設計書は管理者のみデフォルトON） | **低** |
| F-9a | 週次サマリーの🤖 LLM生成ボタンが未実装 | **低** |
| F-10 | ガントエクスポート機能（PNG/PDF）が未実装 | **低** |

### 設計書との軽微な差異（UX判断として許容可能）

| 項目 | 設計書 | 実装 | 備考 |
|------|--------|------|------|
| GanttPopover 表示方法 | マウスオーバー | クリック | クリックの方が誤表示が少なく実用的 |
| VaultExplorer プレビュー | マウスオーバーで吹き出し | ホバーでボタン表示→クリックでウィンドウ | 同上 |

---

## 修正時の参照ファイル一覧（F項）

| 修正ID | 対象ファイル |
|--------|-------------|
| F-2a | `frontend/src/components/Header.tsx` |
| F-2b, F-2c | `frontend/src/components/Header.tsx`, 新規 ProfileModal コンポーネント |
| F-3a, F-3b | `frontend/src/components/GanttChart.tsx`, `frontend/src/components/tabs/MainTab.tsx` |
| F-4a | `frontend/src/components/tabs/ChatTab.tsx` |
| F-6a | `frontend/src/components/tabs/DashboardTab.tsx:25` |
| F-9a | `frontend/src/components/GanttChart.tsx` (WeeklySummaryRow) |
| F-10 | `frontend/src/components/tabs/MainTab.tsx`, 新規エクスポートロジック |
