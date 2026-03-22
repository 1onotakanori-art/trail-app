#!/bin/bash
# TRAIL 起動スクリプト

echo "=== TRAIL 起動 ==="

# バックエンド起動
echo "[1/2] バックエンド起動中..."
cd backend
if [ ! -d ".venv" ]; then
  echo "  仮想環境を作成中..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# フロントエンド起動
echo "[2/2] フロントエンド起動中..."
cd frontend
if [ ! -d "node_modules" ]; then
  echo "  依存パッケージをインストール中..."
  npm install -q
fi
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ TRAIL 起動完了"
echo "   バックエンド: http://localhost:8000"
echo "   フロントエンド: http://localhost:5173"
echo "   デフォルト管理者: admin / admin"
echo ""
echo "停止するには Ctrl+C を押してください"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '停止しました'" EXIT
wait
