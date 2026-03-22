import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Channel, Message } from '../../types'
import { channelsApi, messagesApi } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../hooks/useWebSocket'
import ObsidianPreview from '../ObsidianPreview'

const TAG_COLORS: Record<string, string> = {
  '報告': '#1565c0',
  '連絡': '#2e7d32',
  '相談': '#e65100',
}

const REACTIONS = ['👍', '👀', '✅', '❓', '💡']

export default function ChatTab() {
  const { user, token } = useAuth()
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [tag, setTag] = useState<string>('')
  const [sortMode, setSortMode] = useState<'updated' | 'created' | 'bookmarked' | 'unread'>('updated')
  const [filterBookmarked, setFilterBookmarked] = useState(false)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadChannels = useCallback(async () => {
    const res = await channelsApi.list({ sort: sortMode, bookmarked_only: filterBookmarked })
    setChannels(res.data)
  }, [sortMode, filterBookmarked])

  useEffect(() => { loadChannels() }, [loadChannels])

  const loadMessages = useCallback(async (ch: Channel) => {
    const res = await messagesApi.list(ch.id, { limit: 50 })
    setMessages(res.data)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [])

  useEffect(() => {
    if (activeChannel) loadMessages(activeChannel)
  }, [activeChannel, loadMessages])

  const handleWsMessage = useCallback((data: unknown) => {
    const d = data as { type: string; message?: Message; channel_id?: string; message_id?: string; reactions?: Record<string, string[]> }
    if (d.type === 'new_message' && d.message && d.channel_id === activeChannel?.id) {
      setMessages((prev) => [...prev, d.message!])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
    if (d.type === 'reaction' && d.message_id) {
      setMessages((prev) =>
        prev.map((m) => m.id === d.message_id ? { ...m, reactions: d.reactions || {} } : m)
      )
    }
    if (d.type === 'new_message') loadChannels()
  }, [activeChannel, loadChannels])

  useWebSocket(token, handleWsMessage)

  const sendMessage = async () => {
    if (!input.trim() || !activeChannel) return
    await messagesApi.post(activeChannel.id, {
      content: input.trim(),
      tag: tag || undefined,
    })
    setInput('')
    setTag('')
    loadMessages(activeChannel)
  }

  const toggleBookmark = async (ch: Channel, e: React.MouseEvent) => {
    e.stopPropagation()
    await channelsApi.bookmark(ch.id, !ch.bookmarked)
    loadChannels()
  }

  const toggleReaction = async (msg: Message, emoji: string) => {
    await messagesApi.react(msg.id, emoji)
  }

  const formatTime = (dt: string) => {
    if (!dt) return ''
    const d = new Date(dt)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div style={styles.container}>
      {/* Left: channel list */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <select
            style={styles.sortSelect}
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
          >
            <option value="updated">更新順</option>
            <option value="created">作成順</option>
            <option value="bookmarked">BM優先</option>
            <option value="unread">未読優先</option>
          </select>
          <button
            style={{ ...styles.filterBtn, background: filterBookmarked ? '#e3f2fd' : undefined }}
            onClick={() => setFilterBookmarked(!filterBookmarked)}
          >
            ★BM
          </button>
        </div>
        <div style={styles.channelList}>
          {channels.map((ch) => (
            <div
              key={ch.id}
              style={{
                ...styles.channelItem,
                background: activeChannel?.id === ch.id ? '#e3f2fd' : 'transparent',
              }}
              onClick={() => setActiveChannel(ch)}
            >
              <div style={styles.channelTop}>
                <button
                  style={{ ...styles.bookmarkBtn, color: ch.bookmarked ? '#f9a825' : '#ccc' }}
                  onClick={(e) => toggleBookmark(ch, e)}
                >
                  ★
                </button>
                <span style={styles.channelName}>{ch.name}</span>
                {ch.unread_count > 0 && (
                  <span style={styles.unreadDot} />
                )}
              </div>
              {ch.last_message && (
                <div style={styles.channelPreview}>{ch.last_message.slice(0, 30)}</div>
              )}
              {ch.last_message_at && (
                <div style={styles.channelTime}>{formatTime(ch.last_message_at)}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right: message area */}
      <div style={styles.messageArea}>
        {activeChannel ? (
          <>
            <div style={styles.messageHeader}>
              <strong>{activeChannel.name}</strong>
            </div>
            <div style={styles.messageList}>
              {messages.map((msg) => (
                <div key={msg.id} style={styles.messageItem}>
                  <div style={styles.messageMeta}>
                    {msg.tag && (
                      <span style={{ ...styles.tagBadge, background: TAG_COLORS[msg.tag] || '#666' }}>
                        {msg.tag}
                      </span>
                    )}
                    <span style={styles.senderName}>{msg.display_name}</span>
                    <span style={styles.messageTime}>{formatTime(msg.created_at)}</span>
                  </div>
                  <div style={styles.messageContent}>{msg.content}</div>
                  {msg.obsidian_links?.map((link, i) => (
                    <div key={i} style={styles.obsidianLink}>
                      <span>📄 {link.label || link.path.split('/').pop()}</span>
                      <button
                        style={styles.previewBtn}
                        onClick={() => setPreviewPath(link.path)}
                      >
                        プレビュー
                      </button>
                      <a href={link.uri} style={styles.openBtn}>🔗</a>
                    </div>
                  ))}
                  <div style={styles.reactionBar}>
                    {Object.entries(msg.reactions || {}).map(([emoji, users]) => (
                      <button
                        key={emoji}
                        style={{
                          ...styles.reactionBtn,
                          background: users.includes(user?.id || '') ? '#e3f2fd' : '#f5f5f5',
                        }}
                        onClick={() => toggleReaction(msg, emoji)}
                      >
                        {emoji} {users.length}
                      </button>
                    ))}
                    <div style={styles.reactionPicker}>
                      {REACTIONS.map((e) => (
                        <button
                          key={e}
                          style={styles.emojiBtn}
                          onClick={() => toggleReaction(msg, e)}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div style={styles.inputArea}>
              <select
                style={styles.tagSelect}
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              >
                <option value="">タグなし</option>
                <option value="報告">報告</option>
                <option value="連絡">連絡</option>
                <option value="相談">相談</option>
              </select>
              <input
                style={styles.textInput}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="メッセージを入力..."
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              />
              <button style={styles.sendBtn} onClick={sendMessage}>送信</button>
            </div>
          </>
        ) : (
          <div style={styles.emptyState}>チャンネルを選択してください</div>
        )}
      </div>

      {previewPath && (
        <ObsidianPreview path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', height: 'calc(100vh - 92px)', overflow: 'hidden' },
  sidebar: { width: '280px', borderRight: '1px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column' },
  sidebarHeader: { padding: '8px', borderBottom: '1px solid #eee', display: 'flex', gap: '6px' },
  sortSelect: { flex: 1, padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' },
  filterBtn: { padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  channelList: { overflowY: 'auto', flex: 1 },
  channelItem: { padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' },
  channelTop: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' },
  bookmarkBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: 0 },
  channelName: { fontSize: '14px', fontWeight: 500, flex: 1 },
  unreadDot: { width: '8px', height: '8px', background: '#1565c0', borderRadius: '50%' },
  channelPreview: { fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  channelTime: { fontSize: '11px', color: '#aaa', marginTop: '2px' },
  messageArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  messageHeader: { padding: '12px 16px', borderBottom: '1px solid #eee', background: '#fff', fontSize: '15px' },
  messageList: { flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  messageItem: { background: '#fff', borderRadius: '8px', padding: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  messageMeta: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' },
  tagBadge: { color: '#fff', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 },
  senderName: { fontWeight: 600, fontSize: '14px', color: '#1a237e' },
  messageTime: { fontSize: '12px', color: '#999', marginLeft: 'auto' },
  messageContent: { fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  obsidianLink: { marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '13px' },
  previewBtn: { padding: '2px 8px', background: '#e3f2fd', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
  openBtn: { fontSize: '14px', textDecoration: 'none' },
  reactionBar: { marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' },
  reactionBtn: { border: '1px solid #e0e0e0', borderRadius: '12px', padding: '2px 8px', cursor: 'pointer', fontSize: '13px' },
  reactionPicker: { display: 'flex', gap: '2px', marginLeft: 'auto' },
  emojiBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '2px' },
  inputArea: { padding: '12px 16px', borderTop: '1px solid #eee', background: '#fff', display: 'flex', gap: '8px', alignItems: 'center' },
  tagSelect: { padding: '8px 6px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' },
  textInput: { flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', outline: 'none' },
  sendBtn: { padding: '8px 16px', background: '#1a237e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },
  emptyState: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '15px' },
}
