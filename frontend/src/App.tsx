import { useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import LoginPage from './components/LoginPage'
import Header from './components/Header'
import MainTab from './components/tabs/MainTab'
import ChatTab from './components/tabs/ChatTab'
import ProjectsTab from './components/tabs/ProjectsTab'
import DashboardTab from './components/tabs/DashboardTab'
import { TabId } from './types'

const TABS: { id: TabId; label: string }[] = [
  { id: 'main', label: 'メイン' },
  { id: 'chat', label: 'チャット' },
  { id: 'projects', label: 'プロジェクト管理' },
  { id: 'dashboard', label: 'ダッシュボード' },
]

function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('main')

  const renderTab = () => {
    switch (activeTab) {
      case 'main': return <MainTab />
      case 'chat': return <ChatTab />
      case 'projects': return <ProjectsTab />
      case 'dashboard': return <DashboardTab />
    }
  }

  return (
    <div style={styles.shell}>
      <Header />
      <nav style={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.activeTab : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main style={styles.content}>
        {renderTab()}
      </main>
    </div>
  )
}

export default function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={styles.loading}>
        <span>読み込み中...</span>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return <AppShell />
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f5f5f5',
  },
  tabBar: {
    display: 'flex',
    background: '#fff',
    borderBottom: '1px solid #e0e0e0',
    padding: '0 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  tab: {
    padding: '12px 20px',
    border: 'none',
    background: 'none',
    fontSize: '14px',
    fontWeight: 500,
    color: '#666',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'color 0.2s, border-color 0.2s',
    marginBottom: '-1px',
  },
  activeTab: {
    color: '#1a237e',
    borderBottom: '2px solid #1a237e',
    fontWeight: 600,
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666',
    fontSize: '16px',
  },
}
