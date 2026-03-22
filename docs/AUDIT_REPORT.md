# TRAIL 設計書準拠監査レポート

> **監査日:** 2026-03-22
> **対象:** DESIGN.md セクション4（DB設計）、セクション9（API設計）、セクション7（UI設計）
> **範囲:** Phase 1〜5（Phase 6: 検索/仕上げ、Phase 7: LLM は対象外）

---

## 1. DESIGN.md に記載されているが未実装の機能（Phase 5まで）

| # | 項目 | 設計書の記載 | 実際の実装 | 乖離の内容 |
|---|------|-------------|-----------|-----------|
| 1 | `POST /api/auth/refresh` | 9.1: トークン更新エンドポイント | 未実装 | JWTリフレッシュAPIが存在しない。ログイン時のみトークン発行 |
| 2 | `POST /api/daily-logs/{id}/llm-summary` | 9.10: LLM要約生成 | 未実装 | Phase 7（将来）機能だが、API設計には記載あり |
| 3 | `POST /api/.../weekly-summaries/{week_start}/generate` | 9.8: LLM週次サマリー生成 | 未実装 | 同上、LLM連携は Phase 7 |
| 4 | ガントエクスポート（PNG/PDF） | 6.13: html2canvas + jsPDF でPNG/PDF出力 | 未実装 | エクスポートボタン・ロジックともにフロントエンドに存在しない |
| 5 | ガント：依存関係のドラッグ作成 | 6.7: 子タスクバー右端→左端にドラッグ | TaskManagementモーダルでの手動設定のみ | ガント上のドラッグ操作による矢印作成は未実装 |
| 6 | ガント：依存矢印のクリック削除 | 6.7: 矢印クリック→削除ボタン | 未実装 | ガント上で矢印を直接操作するUIがない |
| 7 | ガント：ドラッグ＆ドロップ日程調整 | 5-②: D&Dで日程調整 | 未実装 | タスクバーのドラッグ移動・リサイズは未対応 |
| 8 | 検索結果クリック遷移 | 7.2: 各結果をクリックで該当箇所に遷移 | 検索結果のドロップダウン表示のみ | 結果クリック時のナビゲーション処理が未実装 |
| 9 | ユーザーメニュー: プロフィール編集/パスワード変更 | 7.2: ドロップダウンにプロフィール編集/パスワード変更 | ログアウトのみ | プロフィール編集・パスワード変更のUI画面がない |
| 10 | ブラウザ通知（Notification API） | 3, Phase 2: Browser Notification API | 未実装 | WebSocket受信時のブラウザプッシュ通知がない |
| 11 | Daily Cron（日次バッチ） | 5-⑤: 2日以上note更新なし等の自動検知 | ダッシュボードAPIのリアルタイム判定のみ | 定期バッチ処理は未実装（APIアクセス時のみ判定） |
| 12 | チャット：@メンション表示 | 7.4, 4.12: mentions JSON、メンションUI | メッセージ投稿時にmentions保存はされる | メッセージ本文内での@表示のハイライトUIが未実装 |
| 13 | チャット：Obsidianリンク挿入UI | 5-④: ファイル選択UI→URI自動生成 | obsidian_links フィールドは存在 | メッセージ投稿時のファイル選択UIがない |
| 14 | クイック登録：タグ入力 | 7.2: 最小限の入力＝業務名/担当者/開始日/終了日 | 名前/担当者/日付/Feeling のみ | タグ入力フィールドはないが、設計書も「最小限」としているためグレーゾーン |
| 15 | ObsidianプレビューのD&Dリサイズ | 7.4, 8.7: ドラッグで移動、リサイズ可能 | ドラッグ移動のみ実装 | リサイズハンドルが未実装 |
| 16 | search_index への網羅的登録 | 4.15: messages/projects/notes/daily_logs/weekly_summaries を横断検索 | project作成時とnote同期時のみFTS登録 | messages投稿時、daily_logs コメント編集時、weekly_summaries 更新時にFTS登録されていない |

---

## 2. DESIGN.md の仕様と異なる実装になっている箇所

| # | 項目 | 設計書の記載 | 実際の実装 | 乖離の内容 |
|---|------|-------------|-----------|-----------|
| 1 | milestones.description カラム | 4.7: `description TEXT` (NOT NULL想定) | `description TEXT` (NULLable) | NULLが許容されている（実害は少ないが設計書にNULL許容の記載なし） |
| 2 | milestones.created_at | 4.7: 記載なし | DBにもcreated_atカラムなし | 他テーブルにあるcreated_atが milestones にだけ存在しない（設計書通りだが一貫性なし） |
| 3 | 通知の body 内容 | 5-①: 全員向け通知にプロジェクト情報 | `担当: {owner_id}` （IDがそのまま） | owner_id ではなく display_name を表示すべき |
| 4 | task_dependencies.dep_type | 4.5: `FS` のみ（将来拡張可） | CHECK制約なし、SS/FF/SF も受付可能 | DB側でFSのみの制約がない。APIは SS/FF/SF もバリデーション通る |
| 5 | WebSocket note_synced/vault_tree_updated | 9.15: Server→Client | バックエンドは送信するが、フロントエンドで未受信 | obsidian.pyから broadcast 実行しているが、useWebSocket で受信処理していない |
| 6 | DashboardTab ウィジェット永続化 | 7.6: user_settings テーブルに保存 | localStorage + サーバー保存（best-effort） | localStorage 優先で、サーバー保存が失敗しても無視。設計書はサーバー永続化を前提 |
| 7 | チャットスレッド並び替え | 7.4: 更新日時順/作成日時順/ブックマーク優先/未読優先 | updated/created/bookmarked_only/unread | bookmarked_only は「ブックマークのみ表示（フィルタ）」であり、設計書の「ブックマーク優先（並び替え）」と異なる |
| 8 | 週次サマリーAPI配置 | 9.8: 独立したAPIセクション | daily_logs ルーターに同居 | weekly_summaries エンドポイントが daily_logs.py 内に実装されている（動作上は問題ないがコード構成の乖離） |

---

## 3. DESIGN.md に記載のないが実装されている機能

| # | 項目 | 実装内容 | 確認が必要な点 |
|---|------|---------|--------------|
| 1 | `GET /api/health` | ヘルスチェックエンドポイント（status: ok 返却） | 運用上の必要性から追加と思われる。意図的な追加か確認 |
| 2 | `GET /api/dashboard/alerts` | 管理者向けフォローアラート専用エンドポイント | ダッシュボードAPIとは別に独立。設計書では dashboard ウィジェットの一部として記載 |
| 3 | デフォルト管理者の自動作成 | main.py: 起動時に admin/admin ユーザーを自動作成 | 開発用シード処理。本番運用時のセキュリティリスク確認が必要 |
| 4 | `channel-general` シードデータ | database.py: 「全体」チャンネルを自動作成 | 設計書5-④に全体スレッドの記載はあるが、自動シードの明示はない |
| 5 | GanttChart: State/Feeling 変更モーダル | ガント上でState/Feeling をクリックして直接変更できるUI | 設計書6.10に「クリック→変更UI」の記載はあるが、具体的なモーダル仕様は未記載 |
| 6 | QuickAddModal: Feeling 選択フィールド | クイック登録にFeeling選択が含まれる | 設計書7.2の「最小限の入力」にFeelingは含まれていない |
| 7 | WebSocket: ping/pong | クライアントからの ping に pong を返す | 設計書9.15のWebSocketイベント一覧に記載なし。接続維持用と思われる |
| 8 | 全体チャンネルへの自動subscribe | 明示的なロジックなし | チャンネル一覧取得時にsubscription有無でフィルタされるため、全体チャンネルへの自動参加ロジックの確認が必要 |

---

## 総合所見

### DB設計（セクション4）
15テーブルすべてが設計書通りに実装されている。カラム定義もほぼ一致し、乖離は軽微。

### API設計（セクション9）
Phase 7（LLM）を除き、ほぼすべてのエンドポイントが実装済み。`/api/auth/refresh` のみ Phase 1-5 範囲内で欠落。

### UI設計（セクション7）
4タブ構成・ヘッダー・ウィジェットなど骨格は揃っている。未実装は主にガントのドラッグ操作系（依存関係作成、日程調整、エクスポート）とブラウザ通知。

### Obsidian連携
フォルダ自動生成、watchdog監視、プレビュー、クローズ時更新まで一通り実装済み。

### FTS5検索
構造はあるがデータ登録が不完全（messages, daily_logs comments, weekly_summaries が未登録）。

### 優先対応推奨
1. **FTS5データ登録の補完** — 検索機能の実用性に直結
2. **`/api/auth/refresh`** — JWT有効期限切れ時のUX悪化
3. **通知body のowner_id→display_name修正** — 軽微だが品質向上
4. **ブラウザ通知（Notification API）** — チャット実運用に重要
