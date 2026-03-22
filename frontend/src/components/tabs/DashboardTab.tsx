import { useAuth } from '../../contexts/AuthContext'

export default function DashboardTab() {
  const { user } = useAuth()

  return (
    <div style={{ padding: '24px', color: '#555' }}>
      <h2 style={{ margin: '0 0 16px', color: '#1a237e' }}>ダッシュボード</h2>
      <p>ようこそ、{user?.display_name} さん</p>
      <p style={{ fontSize: '13px', color: '#888' }}>
        ウィジェット方式のダッシュボードは Phase 5 で実装予定
      </p>
    </div>
  )
}
