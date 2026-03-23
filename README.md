# TRAIL — Team Reporting And Integrated Log

チームの日次報告・タスク管理・Obsidian Vault 連携を一体化した社内向け Web アプリです。

---

## 目次

- [概要](#概要)
- [必要な環境](#必要な環境)
- [セットアップ](#セットアップ)
- [起動方法](#起動方法)
- [環境変数の設定](#環境変数の設定)
- [Obsidian Vault の設定](#obsidian-vault-の設定)
- [LLM 連携（オプション）](#llm-連携オプション)
- [デフォルトアカウント](#デフォルトアカウント)
- [技術スタック](#技術スタック)
- [トラブルシューティング](#トラブルシューティング)

---

## 概要

| 機能 | 内容 |
|------|------|
| プロジェクト管理 | 状態・感情・タグ付き、Box.com/Obsidian リンク連携 |
| タスク管理 | Gantt チャート、依存関係、日次進捗トラッキング |
| チャット | チャンネル別、メンション、報告/連絡/相談タグ |
| Obsidian 連携 | Vault の自動監視・同期、日報とのリンク |
| 全文検索 | SQLite FTS5 による高速検索 |
| LLM 連携 | LM Studio 経由で週次サマリーを自動生成（オプション） |

---

## 必要な環境

### Python

**Python 3.10 以上** を推奨します（3.8 以上なら動作しますが、非推奨）。

```bash
python3 --version
# Python 3.10.x 以上であること
```

> **注意**: macOS の場合、`python3` が Xcode Command Line Tools 付属の古いバージョン (3.9 以下) の場合があります。
> [pyenv](https://github.com/pyenv/pyenv) などで 3.10 以上をインストールしてください。

```bash
# pyenv を使う場合
pyenv install 3.11.9
pyenv local 3.11.9
```

### Node.js / npm

**Node.js 18 以上** が必要です。

```bash
node --version   # v18.x.x 以上
npm --version    # 9.x.x 以上
```

> **注意**: `nvm` (Node Version Manager) を使っている場合は、シェルの初期化設定が正しくされているか確認してください。
> `nvm use 18` などで切り替えが必要な場合があります。

---

## セットアップ

### 1. リポジトリを取得

```bash
git clone <リポジトリURL>
cd trail-app
```

### 2. バックエンドの設定ファイルを作成

> **この手順を省略すると起動時にエラーになります。**

```bash
cd backend
cp .env.example .env
```

`.env` を開き、**`SECRET_KEY` を必ず変更** してください（起動の必須条件です）:

```bash
# .env
SECRET_KEY=ここに長いランダム文字列を入れる  # 必須！デフォルトのままだと起動失敗
DATABASE_URL=./trail.db
VAULT_PATH=./vault
VAULT_NAME=TeamVault
PROJECT_FOLDER=200_Projects
ACCESS_TOKEN_EXPIRE_DAYS=30
```

`SECRET_KEY` は以下のコマンドで生成できます:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## 起動方法

### 一発起動（推奨）

```bash
cd trail-app
bash start.sh
```

初回は自動的に以下を行います:
- Python 仮想環境 (`.venv`) の作成
- pip パッケージのインストール
- npm パッケージのインストール

起動後:
- フロントエンド: http://localhost:5173
- バックエンド API: http://localhost:8000

`Ctrl+C` で両方のプロセスが停止します。

---

### 手動起動（バックエンド・フロントエンド個別に動かしたい場合）

**バックエンド:**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows の場合: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**フロントエンド（別ターミナルで）:**

```bash
cd frontend
npm install
npm run dev
```

---

## 環境変数の設定

`backend/.env` に以下の変数を設定します。

| 変数名 | 必須 | デフォルト値 | 説明 |
|--------|------|-------------|------|
| `SECRET_KEY` | **必須** | なし | JWT 署名用の秘密鍵。**起動前に必ず設定してください** |
| `DATABASE_URL` | 任意 | `./trail.db` | SQLite ファイルのパス |
| `VAULT_PATH` | 任意 | `./vault` | Obsidian Vault のローカルパス |
| `VAULT_NAME` | 任意 | `TeamVault` | Vault の表示名 |
| `PROJECT_FOLDER` | 任意 | `200_Projects` | Vault 内のプロジェクトフォルダ名 |
| `ACCESS_TOKEN_EXPIRE_DAYS` | 任意 | `30` | JWT トークンの有効期限（日） |
| `LM_STUDIO_URL` | 任意 | `http://localhost:1234/v1` | LM Studio の API エンドポイント |
| `LM_STUDIO_MODEL` | 任意 | `local-model` | 使用する LLM モデル名 |

> **`SECRET_KEY` を設定しないと起動時に次のエラーが出て終了します:**
> ```
> SECRET_KEY が設定されていません。backend/.env を確認してください。
> ```

---

## Obsidian Vault の設定

Obsidian 連携はオプションです。使用しない場合はデフォルト設定のままで問題ありません（`./vault` ディレクトリが自動生成されます）。

### Vault を使う場合

1. 既存の Obsidian Vault のパスを `.env` の `VAULT_PATH` に設定します:

```bash
VAULT_PATH=/Users/yourname/Documents/MyVault
VAULT_NAME=MyVault
PROJECT_FOLDER=200_Projects   # Vault内の実際のフォルダ名に合わせる
```

2. `PROJECT_FOLDER` には Vault 内でプロジェクトファイルを管理しているフォルダ名を指定します。

3. 週次テンプレートを使う場合は Vault 内に `400_Template/` フォルダを用意してください。

> **注意**: `VAULT_PATH` に指定したディレクトリが存在しない場合、起動時に自動作成されますが Obsidian 機能は動作しません。

---

## LLM 連携（オプション）

週次サマリー自動生成に [LM Studio](https://lmstudio.ai/) を使用します。LM Studio がない場合でもアプリは通常通り動作します。

### LM Studio の設定

1. LM Studio をインストールし、モデルをロードします。
2. LM Studio の「Local Server」を起動します（デフォルトポート: 1234）。
3. `.env` に設定します:

```bash
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=<LM Studio で選択中のモデル名>
```

4. アプリの管理画面 (設定 → システム設定) からも変更可能です。

---

## デフォルトアカウント

初回起動時に管理者アカウントが自動作成されます:

| 項目 | 値 |
|------|----|
| ユーザー名 | `admin` |
| パスワード | `admin` |

> **セキュリティのため、初回ログイン後すぐにパスワードを変更してください。**

---

## 技術スタック

| 層 | 技術 |
|----|------|
| フロントエンド | React 18 + TypeScript + Vite |
| バックエンド | Python / FastAPI + Uvicorn |
| データベース | SQLite (FTS5 全文検索) |
| 認証 | JWT (python-jose) + bcrypt (passlib) |
| リアルタイム通信 | WebSocket |
| Vault 監視 | watchdog |

---

## トラブルシューティング

### `SECRET_KEY が設定されていません` で起動しない

→ `backend/.env` を作成し `SECRET_KEY` を設定してください（[セットアップ手順 2](#2-バックエンドの設定ファイルを作成) 参照）。

### `python3` コマンドが見つからない / バージョンが古い

→ Python 3.10 以上をインストールしてください。macOS では `brew install python@3.11`、Linux では `sudo apt install python3.11` など。

### `npm: command not found`

→ Node.js をインストールしてください: https://nodejs.org/

### `npm install` が失敗する

→ Node.js のバージョンを確認してください（18 以上が必要）。`node --version` で確認。

### ポート 8000 / 5173 が既に使用中

→ 既存プロセスを停止してください:
```bash
lsof -ti:8000 | xargs kill   # バックエンドポートを解放
lsof -ti:5173 | xargs kill   # フロントエンドポートを解放
```

### フロントエンドから API にアクセスできない

→ バックエンドが起動しているか確認してください: http://localhost:8000/api/health
→ ブラウザのコンソールで CORS エラーが出ている場合は、フロントエンドを必ず `http://localhost:5173` でアクセスしてください。

### Obsidian 連携が動かない

→ `VAULT_PATH` が実際に存在するディレクトリか確認してください。
→ `PROJECT_FOLDER` が Vault 内の実際のフォルダ名と一致しているか確認してください。

### `passlib` / `bcrypt` の警告が出る

→ 動作に影響はありません。必要な場合は `pip install bcrypt==4.0.1` でバージョンを固定してください。

---

## ディレクトリ構成

```
trail-app/
├── backend/
│   ├── main.py              # FastAPI アプリ エントリポイント
│   ├── config.py            # 環境変数設定
│   ├── database.py          # DB 初期化・接続
│   ├── routers/             # API ルーター群
│   ├── requirements.txt     # Python 依存パッケージ
│   ├── .env.example         # 環境変数テンプレート
│   └── .env                 # 環境変数（要作成・git 管理外）
├── frontend/
│   ├── src/
│   │   ├── components/      # React コンポーネント
│   │   ├── api/             # API クライアント
│   │   ├── contexts/        # React Context
│   │   ├── hooks/           # カスタムフック
│   │   └── types/           # TypeScript 型定義
│   ├── package.json
│   └── vite.config.ts
├── docs/                    # 設計ドキュメント
└── start.sh                 # 一発起動スクリプト
```
