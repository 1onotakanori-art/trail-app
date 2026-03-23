import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { notificationsApi, searchApi, usersApi } from '../api/client'
import { Notification } from '../types'
import { useWebSocket } from '../hooks/useWebSocket'

interface Props {
  onSearch?: (query: string) => void
  onQuickAdd?: () => void
  onNavigate?: (type: string, id: string) => void  // 4-10: Navigation callback
}

export default function Header({ onSearch, onQuickAdd, onNavigate }: Props) {
  const { user, logout, token } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ type: string; id: string; title: string; snippet: string }[]>([])
  const [showSearch, setShowSearch] = useState(false)
  // 4-15, 4-16: Profile/password modal state
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  const loadUnreadCount = useCallback(async () => {
    try {
      const res = await notificationsApi.unreadCount()
      setUnreadCount(res.data.count)
    } catch (err) { console.error('Failed to load unread count:', err) } // 4-7: console.error
  }, [])

  const loadNotifications = useCallback(async () => {
    try {
      const res = await notificationsApi.list()
      setNotifications(res.data)
    } catch (err) { console.error('Failed to load notifications:', err) } // 4-7: console.error
  }, [])

  useEffect(() => { loadUnreadCount() }, [loadUnreadCount])

  useWebSocket(token, useCallback((data) => {
    const d = data as { type: string }
    if (['mention', 'message', 'notification', 'project_created'].includes(d.type)) {
      loadUnreadCount()
    }
  }, [loadUnreadCount]))

  const openNotifications = async () => {
    setShowNotifications(!showNotifications)
    if (!showNotifications) {
      await loadNotifications()
    }
  }

  const markAllRead = async () => {
    await notificationsApi.readAll()
    setUnreadCount(0)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q)
    onSearch?.(q)
    if (q.trim().length < 2) { setSearchResults([]); return }
    try {
      const res = await searchApi.search(q)
      setSearchResults(res.data)
      setShowSearch(true)
    } catch (err) { console.error('Search failed:', err) } // 4-7: console.error
  }, [onSearch])

  const TYPE_ICONS: Record<string, string> = {
    mention: '💬', message: '📢', follow_alert: '⚠', project_created: '📁',
  }

  const formatTime = (dt: string) => {
    const d = new Date(dt)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <header style={styles.header}>
      <div style={styles.logo}>TRAIL</div>

      {/* Search */}
      <div style={styles.searchWrapper}>
        <div style={styles.search}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            type="text"
            placeholder="横断検索..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowSearch(true)}
            onBlur={() => setTimeout(() => setShowSearch(false), 200)}
            style={styles.searchInput}
          />
        </div>
        {showSearch && searchResults.length > 0 && (
          <div style={styles.searchDropdown}>
            {['message', 'project', 'note'].map((type) => {
              const items = searchResults.filter((r) => r.type === type)
              if (!items.length) return null
              const labels: Record<string, string> = { message: '💬 チャット', project: '📁 プロジェクト', note: '📄 note' }
              return (
                <div key={type}>
                  <div style={styles.searchGroup}>{labels[type]}</div>
                  {items.map((r) => (
                    <div key={r.id} style={styles.searchItem}>
                      <div style={styles.searchItemTitle}>{r.title || r.snippet.slice(0, 30)}</div>
                      <div style={styles.searchItemSnippet} dangerouslySetInnerHTML={{ __html: r.snippet }} />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={styles.actions}>
        {/* Notification bell */}
        <div style={{ position: 'relative' }}>
          <button style={styles.iconButton} onClick={openNotifications} title="通知">
            🔔
            {unreadCount > 0 && <span style={styles.badge}>{unreadCount}</span>}
          </button>
          {showNotifications && (
            <div style={styles.notifDropdown}>
              <div style={styles.notifHeader}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>通知</span>
                <button onClick={markAllRead} style={styles.readAllBtn}>すべて既読</button>
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {notifications.length === 0
                  ? <div style={{ padding: '16px', color: '#888', fontSize: '13px', textAlign: 'center' }}>通知はありません</div>
                  : notifications.map((n) => (
                      <div key={n.id} style={{ ...styles.notifItem, background: n.read ? '#fff' : '#f3f8ff', cursor: n.link_type ? 'pointer' : 'default' }}
                        onClick={async () => {
                          // 4-10: Notification click → navigation
                          if (!n.read) {
                            try { await notificationsApi.markRead(n.id) } catch (err) { console.error('Failed to mark read:', err) }
                            setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x))
                            setUnreadCount((c) => Math.max(0, c - 1))
                          }
                          if (n.link_type && n.link_id && onNavigate) {
                            onNavigate(n.link_type, n.link_id)
                            setShowNotifications(false)
                          }
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>{TYPE_ICONS[n.type] || '📢'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>{n.body}</div>
                          <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>{formatTime(n.created_at)}</div>
                        </div>
                      </div>
                    ))
                }
              </div>
            </div>
          )}
        </div>

        {/* Quick add */}
        <button style={styles.iconButton} onClick={onQuickAdd} title="新規業務登録">
          ＋
        </button>

        {/* User menu */}
        <div style={{ position: 'relative' }}>
          <button style={styles.userButton} onClick={() => setShowUserMenu(!showUserMenu)}>
            👤 {user?.display_name}
            <span style={{ fontSize: '10px', opacity: 0.8 }}>▾</span>
          </button>
          {showUserMenu && (
            <div style={styles.dropdown}>
              <div style={styles.dropdownItem}>
                <span style={styles.dropdownLabel}>{user?.username}</span>
                <span style={styles.dropdownRole}>{user?.role === 'admin' ? '管理者' : 'メンバー'}</span>
              </div>
              <hr style={{ margin: 0, border: 'none', borderTop: '1px solid #eee' }} />
              {/* 4-15: Profile edit */}
              <button style={styles.dropdownButton} onClick={() => { setShowProfileModal(true); setShowUserMenu(false) }}>
                プロフィール編集
              </button>
              {/* 4-16: Password change */}
              <button style={styles.dropdownButton} onClick={() => { setShowPasswordModal(true); setShowUserMenu(false) }}>
                パスワード変更
              </button>
              <hr style={{ margin: 0, border: 'none', borderTop: '1px solid #eee' }} />
              <button style={{ ...styles.dropdownButton, color: '#d32f2f' }} onClick={logout}>ログアウト</button>
            </div>
          )}
        </div>
      </div>
      {/* 4-15: Profile edit modal */}
      {showProfileModal && user && (
        <ProfileModal userId={user.id} currentName={user.display_name} onClose={() => setShowProfileModal(false)} />
      )}
      {/* 4-16: Password change modal */}
      {showPasswordModal && user && (
        <PasswordModal userId={user.id} onClose={() => setShowPasswordModal(false)} />
      )}
    </header>
  )
}

// 4-15: Profile edit modal component
function ProfileModal({ userId, currentName, onClose }: { userId: string; currentName: string; onClose: () => void }) {
  const [displayName, setDisplayName] = useState(currentName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim()) { setError('表示名を入力してください'); return }
    setLoading(true)
    try {
      // 5-5: Use profile-specific API endpoint
      await usersApi.updateProfile(userId, { display_name: displayName.trim() })
      setSuccess(true)
      setTimeout(() => onClose(), 1000)
    } catch {
      setError('更新に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyles.box}>
        <div style={modalStyles.header}>
          <strong>プロフィール編集</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={submit} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>表示名</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={modalStyles.input} autoFocus />
          </div>
          {error && <p style={{ color: '#c62828', fontSize: '13px', margin: 0 }}>{error}</p>}
          {success && <p style={{ color: '#2e7d32', fontSize: '13px', margin: 0 }}>更新しました</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={onClose} style={modalStyles.cancelBtn}>キャンセル</button>
            <button type="submit" style={modalStyles.submitBtn} disabled={loading}>{loading ? '保存中...' : '保存'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// 4-16: Password change modal component
function PasswordModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) { setError('新しいパスワードが一致しません'); return }
    if (newPassword.length < 6) { setError('パスワードは6文字以上にしてください'); return }
    setLoading(true)
    try {
      // 5-5: Use password change API
      await usersApi.changePassword(userId, {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setSuccess(true)
      setTimeout(() => onClose(), 1000)
    } catch {
      setError('パスワード変更に失敗しました。現在のパスワードを確認してください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={modalStyles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalStyles.box}>
        <div style={modalStyles.header}>
          <strong>パスワード変更</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={submit} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>現在のパスワード</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={modalStyles.input} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>新しいパスワード</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={modalStyles.input} />
          </div>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>新しいパスワード（確認）</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={modalStyles.input} />
          </div>
          {error && <p style={{ color: '#c62828', fontSize: '13px', margin: 0 }}>{error}</p>}
          {success && <p style={{ color: '#2e7d32', fontSize: '13px', margin: 0 }}>パスワードを変更しました</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={onClose} style={modalStyles.cancelBtn}>キャンセル</button>
            <button type="submit" style={modalStyles.submitBtn} disabled={loading}>{loading ? '変更中...' : '変更'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 },
  box: { background: '#fff', borderRadius: '10px', width: '400px', maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  header: { padding: '14px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  input: { width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' as const },
  cancelBtn: { padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', background: '#fff' },
  submitBtn: { padding: '8px 24px', background: '#1a237e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 },
}

const styles: Record<string, React.CSSProperties> = {
  header: { height: '52px', background: '#1a237e', color: '#fff', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '16px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' },
  logo: { fontSize: '18px', fontWeight: 700, letterSpacing: '3px', minWidth: '80px' },
  searchWrapper: { flex: 1, position: 'relative', maxWidth: '480px' },
  search: { display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '0 10px' },
  searchIcon: { fontSize: '14px', marginRight: '8px', opacity: 0.8 },
  searchInput: { flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', padding: '8px 0' },
  searchDropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 300, marginTop: '4px', overflow: 'hidden' },
  searchGroup: { padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#888', background: '#f5f5f5' },
  searchItem: { padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' },
  searchItemTitle: { fontSize: '13px', fontWeight: 600, color: '#333' },
  searchItemSnippet: { fontSize: '12px', color: '#888', marginTop: '2px' },
  actions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' },
  iconButton: { position: 'relative', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '16px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  badge: { position: 'absolute', top: '-4px', right: '-4px', background: '#f44336', color: '#fff', borderRadius: '50%', fontSize: '10px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  userButton: { background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '14px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' },
  dropdown: { position: 'absolute', right: 0, top: '100%', marginTop: '4px', background: '#fff', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: '180px', overflow: 'hidden', zIndex: 200 },
  dropdownItem: { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '2px' },
  dropdownLabel: { color: '#333', fontSize: '14px', fontWeight: 600 },
  dropdownRole: { color: '#888', fontSize: '12px' },
  dropdownButton: { width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 16px', fontSize: '14px', color: '#333', cursor: 'pointer' },
  notifDropdown: { position: 'absolute', right: 0, top: '100%', marginTop: '4px', background: '#fff', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', width: '340px', overflow: 'hidden', zIndex: 200 },
  notifHeader: { padding: '10px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  readAllBtn: { background: 'none', border: 'none', color: '#1565c0', cursor: 'pointer', fontSize: '12px' },
  notifItem: { padding: '10px 16px', borderBottom: '1px solid #f5f5f5', display: 'flex', gap: '10px', alignItems: 'flex-start' },
}
