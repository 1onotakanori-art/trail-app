import { useState, useEffect, useCallback } from 'react'
import { GanttProject, User, Channel } from '../../types'
import { ganttApi, usersApi, messagesApi } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../hooks/useWebSocket'
import GanttChart from '../GanttChart'
import VaultExplorer from '../VaultExplorer'
import QuickAddModal from '../QuickAddModal'

type ViewMode = 'all' | 'personal' | 'tag'

interface ChatPanelProps {
  channel: Channel | null
  onClose: () => void
}

function ChatPanel({ channel, onClose }: ChatPanelProps) {
  const { token } = useAuth()
  const [messages, setMessages] = useState<{ id: string; display_name: string; content: string; tag: string | null; created_at: string }[]>([])
  const [input, setInput] = useState('')
  const [tag, setTag] = useState('')

  const loadMessages = useCallback(async () => {
    if (!channel) return
    const res = await messagesApi.list(channel.id, { limit: 30 })
    setMessages(res.data)
  }, [channel])

  useEffect(() => { loadMessages() }, [loadMessages])

  useWebSocket(token, (data) => {
    const d = data as { type: string; channel_id?: string }
    if (d.type === 'new_message' && d.channel_id === channel?.id) loadMessages()
  })

  const send = async () => {
    if (!input.trim() || !channel) return
    await messagesApi.post(channel.id, { content: input.trim(), tag: tag || undefined })
    setInput('')
    loadMessages()
  }

  const TAG_COLORS: Record<string, string> = { '報告': '#1565c0', '連絡': '#2e7d32', '相談': '#e65100' }
  const fmt = (dt: string) => { if (!dt) return ''; const d = new Date(dt); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

  return (
    <div style={{ width: '300px', borderLeft: '1px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <strong style={{ flex: 1, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel?.name || 'チャット'}</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#666' }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {messages.map((m) => (
          <div key={m.id} style={{ background: '#f8f9ff', borderRadius: '6px', padding: '8px 10px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
              {m.tag && <span style={{ background: TAG_COLORS[m.tag] || '#666', color: '#fff', fontSize: '10px', padding: '1px 6px', borderRadius: '8px' }}>{m.tag}</span>}
              <span style={{ fontWeight: 600, fontSize: '12px' }}>{m.display_name}</span>
              <span style={{ fontSize: '11px', color: '#aaa', marginLeft: 'auto' }}>{fmt(m.created_at)}</span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', whiteSpace: 'pre-wrap' }}>{m.content}</p>
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 12px', borderTop: '1px solid #eee', display: 'flex', gap: '6px' }}>
        <select value={tag} onChange={(e) => setTag(e.target.value)} style={{ padding: '6px 4px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}>
          <option value="">-</option>
          <option value="報告">報告</option>
          <option value="連絡">連絡</option>
          <option value="相談">相談</option>
        </select>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          placeholder="メッセージ..." style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }} />
        <button onClick={send} style={{ padding: '6px 12px', background: '#1a237e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>送信</button>
      </div>
    </div>
  )
}

export default function MainTab() {
  const { token } = useAuth()
  const [projects, setProjects] = useState<GanttProject[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [selectedOwner, setSelectedOwner] = useState<string>('')
  const [showVault, setShowVault] = useState(false)
  const [chatChannel, setChatChannel] = useState<Channel | null>(null)
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  const loadGantt = useCallback(async () => {
    const params: Record<string, string> = {}
    if (viewMode === 'personal' && selectedOwner) params.owner_id = selectedOwner
    const res = await ganttApi.getAll(params)
    setProjects(res.data)
  }, [viewMode, selectedOwner])

  useEffect(() => { loadGantt() }, [loadGantt])
  useEffect(() => { usersApi.list().then((r) => setUsers(r.data)) }, [])

  useWebSocket(token, (data) => {
    const d = data as { type: string }
    if (['project_created', 'project_updated', 'progress_updated', 'note_synced', 'dependency_changed'].includes(d.type)) {
      loadGantt()
    }
  })

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 92px)', overflow: 'hidden' }}>
      {/* Vault panel */}
      {showVault && <VaultExplorer onClose={() => setShowVault(false)} />}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '8px 12px', background: '#fff', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setShowVault(!showVault)}
            style={{ padding: '5px 10px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', background: showVault ? '#e3f2fd' : '#fff' }}
          >
            📂 Vault
          </button>
          <div style={{ display: 'flex', background: '#f5f5f5', borderRadius: '6px', padding: '2px' }}>
            {(['all', 'personal', 'tag'] as ViewMode[]).map((m) => (
              <button key={m} onClick={() => setViewMode(m)}
                style={{ padding: '4px 12px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', background: viewMode === m ? '#fff' : 'transparent', fontWeight: viewMode === m ? 600 : 400, boxShadow: viewMode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                {m === 'all' ? '全体' : m === 'personal' ? '個人' : 'タグ別'}
              </button>
            ))}
          </div>
          {viewMode === 'personal' && (
            <select value={selectedOwner} onChange={(e) => setSelectedOwner(e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }}>
              <option value="">全メンバー</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
            </select>
          )}
          <button onClick={() => setShowQuickAdd(true)}
            style={{ marginLeft: 'auto', padding: '5px 14px', background: '#1a237e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
            ＋ 新規業務
          </button>
        </div>

        {/* Gantt */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <GanttChart
            projects={projects}
            viewMode={viewMode}
            selectedOwner={selectedOwner}
            onRefresh={loadGantt}
          />
        </div>
      </div>

      {/* Chat panel */}
      {chatChannel && (
        <ChatPanel channel={chatChannel} onClose={() => setChatChannel(null)} />
      )}

      {showQuickAdd && (
        <QuickAddModal
          users={users}
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); loadGantt() }}
        />
      )}
    </div>
  )
}
