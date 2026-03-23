import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { authApi } from '../api/client'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const { login } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(username, password)
    } catch {
      setError('ユーザー名またはパスワードが正しくありません')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('パスワードは6文字以上にしてください'); return }
    setIsLoading(true)
    try {
      const res = await authApi.register({ username, password, display_name: displayName || username, role })
      const { access_token, refresh_token, user } = res.data
      localStorage.setItem('trail_token', access_token)
      localStorage.setItem('trail_refresh_token', refresh_token)
      localStorage.setItem('trail_user', JSON.stringify(user))
      window.location.reload()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || '登録に失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setError('')
    setUsername('')
    setPassword('')
    setDisplayName('')
    setRole('member')
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <h1 style={styles.logoText}>TRAIL</h1>
          <p style={styles.logoSub}>Team Reporting And Integrated Log</p>
        </div>

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'login' ? styles.activeTab : {}) }}
            onClick={() => switchMode('login')}
          >
            ログイン
          </button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.activeTab : {}) }}
            onClick={() => switchMode('register')}
          >
            新規登録
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>ユーザー名</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                style={styles.input} placeholder="username" autoFocus required />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>パスワード</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                style={styles.input} placeholder="password" required />
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" style={styles.button} disabled={isLoading}>
              {isLoading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} style={styles.form}>
            <div style={styles.field}>
              <label style={styles.label}>ユーザー名 *</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                style={styles.input} placeholder="username" autoFocus required />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>表示名</label>
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                style={styles.input} placeholder="山田 太郎" />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>
                パスワード * <span style={{ fontWeight: 400, color: '#888' }}>(6文字以上)</span>
              </label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                style={styles.input} placeholder="6文字以上" required />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>ロール</label>
              <div style={styles.roleGroup}>
                <label style={styles.roleOption}>
                  <input type="radio" name="role" value="member" checked={role === 'member'}
                    onChange={() => setRole('member')} style={{ marginRight: '6px' }} />
                  <span>
                    <strong>メンバー</strong>
                    <span style={styles.roleDesc}>一般ユーザー。自分の業務を管理できます。</span>
                  </span>
                </label>
                <label style={styles.roleOption}>
                  <input type="radio" name="role" value="admin" checked={role === 'admin'}
                    onChange={() => setRole('admin')} style={{ marginRight: '6px' }} />
                  <span>
                    <strong>管理者</strong>
                    <span style={styles.roleDesc}>全ユーザーの業務を管理・設定変更できます。</span>
                  </span>
                </label>
              </div>
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" style={styles.button} disabled={isLoading}>
              {isLoading ? '登録中...' : 'アカウントを作成'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #3949ab 100%)',
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '40px 40px 48px',
    width: '400px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  logo: { textAlign: 'center', marginBottom: '24px' },
  logoText: { margin: 0, fontSize: '36px', fontWeight: 700, color: '#1a237e', letterSpacing: '4px' },
  logoSub: { margin: '4px 0 0', fontSize: '11px', color: '#666', letterSpacing: '1px' },
  tabs: { display: 'flex', borderBottom: '2px solid #e0e0e0', marginBottom: '24px' },
  tab: {
    flex: 1, padding: '10px', border: 'none', background: 'none', fontSize: '14px',
    fontWeight: 500, color: '#888', cursor: 'pointer', borderBottom: '2px solid transparent',
    marginBottom: '-2px', transition: 'color 0.2s, border-color 0.2s',
  },
  activeTab: { color: '#1a237e', borderBottom: '2px solid #1a237e', fontWeight: 700 },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#333' },
  input: { padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', outline: 'none' },
  roleGroup: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '6px' },
  roleOption: { display: 'flex', alignItems: 'flex-start', cursor: 'pointer', fontSize: '14px', gap: '2px' },
  roleDesc: { display: 'block', fontSize: '11px', color: '#888', marginTop: '2px' },
  error: { color: '#d32f2f', fontSize: '13px', margin: 0, textAlign: 'center' },
  button: {
    padding: '12px', background: '#1a237e', color: '#fff', border: 'none',
    borderRadius: '6px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', marginTop: '4px',
  },
}
