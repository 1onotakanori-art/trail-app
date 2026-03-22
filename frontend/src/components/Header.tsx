import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface HeaderProps {
  onSearch?: (query: string) => void
}

export default function Header({ onSearch }: HeaderProps) {
  const { user, logout } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    onSearch?.(e.target.value)
  }

  return (
    <header style={styles.header}>
      <div style={styles.logo}>TRAIL</div>

      <div style={styles.search}>
        <span style={styles.searchIcon}>🔍</span>
        <input
          type="text"
          placeholder="横断検索..."
          value={searchQuery}
          onChange={handleSearchChange}
          style={styles.searchInput}
        />
      </div>

      <div style={styles.actions}>
        <button style={styles.iconButton} title="通知">
          🔔
          <span style={styles.badge}>0</span>
        </button>

        <button style={styles.iconButton} title="新規登録">
          ＋
        </button>

        <div style={styles.userMenu}>
          <button
            style={styles.userButton}
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            👤 {user?.display_name}
            <span style={styles.caret}>▾</span>
          </button>
          {showUserMenu && (
            <div style={styles.dropdown}>
              <div style={styles.dropdownItem}>
                <span style={styles.dropdownLabel}>{user?.username}</span>
                <span style={styles.dropdownRole}>
                  {user?.role === 'admin' ? '管理者' : 'メンバー'}
                </span>
              </div>
              <hr style={styles.divider} />
              <button style={styles.dropdownButton} onClick={logout}>
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    height: '52px',
    background: '#1a237e',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '16px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  logo: {
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '3px',
    minWidth: '80px',
    color: '#fff',
  },
  search: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(255,255,255,0.15)',
    borderRadius: '6px',
    padding: '0 10px',
    maxWidth: '480px',
  },
  searchIcon: {
    fontSize: '14px',
    marginRight: '8px',
    opacity: 0.8,
  },
  searchInput: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#fff',
    fontSize: '14px',
    padding: '8px 0',
  },
  actions: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  iconButton: {
    position: 'relative',
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '16px',
    padding: '6px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    background: '#f44336',
    color: '#fff',
    borderRadius: '50%',
    fontSize: '10px',
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMenu: {
    position: 'relative',
  },
  userButton: {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    padding: '6px 12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  caret: {
    fontSize: '10px',
    opacity: 0.8,
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: '4px',
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    minWidth: '180px',
    overflow: 'hidden',
    zIndex: 200,
  },
  dropdownItem: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  dropdownLabel: {
    color: '#333',
    fontSize: '14px',
    fontWeight: 600,
  },
  dropdownRole: {
    color: '#888',
    fontSize: '12px',
  },
  divider: {
    margin: 0,
    border: 'none',
    borderTop: '1px solid #eee',
  },
  dropdownButton: {
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    padding: '12px 16px',
    fontSize: '14px',
    color: '#d32f2f',
    cursor: 'pointer',
  },
}
