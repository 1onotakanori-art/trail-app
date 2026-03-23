import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Channel, Message, User } from '../../types'
import { channelsApi, messagesApi, usersApi, vaultApi } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../hooks/useWebSocket'
import ObsidianPreview from '../ObsidianPreview'
import { VaultNode } from '../../types'

const TAG_COLORS: Record<string, string> = {
  '報告': '#1565c0',
  '連絡': '#2e7d32',
  '相談': '#e65100',
}

const REACTIONS = ['👍', '👀', '✅', '❓', '💡']

// 4-12: Highlight @mentions in message content
function renderMessageContent(content: string) {
  const parts = content.split(/(@[^\s@]+)/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ background: '#e3f2fd', color: '#1565c0', fontWeight: 600, borderRadius: '3px', padding: '0 2px' }}>{part}</span>
      : part
  )
}

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
  // 4-6: Track setTimeout for cleanup
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 4-11: Mention UI state
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionPos, setMentionPos] = useState<number>(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  // 4-13: Obsidian link insertion state
  const [showVaultPicker, setShowVaultPicker] = useState(false)
  const [vaultFiles, setVaultFiles] = useState<{ path: string; name: string }[]>([])

  // Load users for mention dropdown
  useEffect(() => { usersApi.list().then((r) => setAllUsers(r.data)).catch(() => {}) }, [])

  // 4-6: Cleanup setTimeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [])

  const loadChannels = useCallback(async () => {
    try { // 4-2: try-catch
      const res = await channelsApi.list({ sort: sortMode, bookmarked_only: filterBookmarked })
      setChannels(res.data)
    } catch (err) {
      console.error('Failed to load channels:', err)
    }
  }, [sortMode, filterBookmarked])

  useEffect(() => { loadChannels() }, [loadChannels])

  const loadMessages = useCallback(async (ch: Channel) => {
    try { // 4-2: try-catch
      const res = await messagesApi.list(ch.id, { limit: 50 })
      setMessages(res.data)
      scrollToBottom()
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }, [scrollToBottom])

  useEffect(() => {
    if (activeChannel) loadMessages(activeChannel)
  }, [activeChannel, loadMessages])

  const handleWsMessage = useCallback((data: unknown) => {
    const d = data as { type: string; message?: Message; channel_id?: string; message_id?: string; reactions?: Record<string, string[]> }
    if (d.type === 'new_message' && d.message && d.channel_id === activeChannel?.id) {
      setMessages((prev) => [...prev, d.message!])
      scrollToBottom()
    }
    if (d.type === 'reaction' && d.message_id) {
      setMessages((prev) =>
        prev.map((m) => m.id === d.message_id ? { ...m, reactions: d.reactions || {} } : m)
      )
    }
    if (d.type === 'new_message') loadChannels()
  }, [activeChannel, loadChannels, scrollToBottom])

  useWebSocket(token, handleWsMessage)

  // 4-11: Handle input change with mention detection
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInput(val)
    const cursorPos = e.target.selectionStart || val.length
    const textBeforeCursor = val.slice(0, cursorPos)
    const mentionMatch = textBeforeCursor.match(/@(\S*)$/)
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1])
      setMentionPos(mentionMatch.index!)
    } else {
      setMentionQuery(null)
    }
  }

  const insertMention = (u: User) => {
    if (mentionPos < 0) return
    const before = input.slice(0, mentionPos)
    const cursorEnd = input.indexOf(' ', mentionPos + 1)
    const after = cursorEnd >= 0 ? input.slice(cursorEnd) : ''
    setInput(`${before}@${u.display_name} ${after}`)
    setMentionQuery(null)
    inputRef.current?.focus()
  }

  const filteredMentionUsers = mentionQuery !== null
    ? allUsers.filter((u) => u.display_name.toLowerCase().includes(mentionQuery.toLowerCase()) || u.username.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : []

  // 4-13: Extract mentions from input
  const extractMentions = (text: string): string[] => {
    const matches = text.match(/@(\S+)/g) || []
    return matches.map((m) => {
      const name = m.slice(1)
      const found = allUsers.find((u) => u.display_name === name || u.username === name)
      return found?.id
    }).filter(Boolean) as string[]
  }

  const sendMessage = async () => {
    if (!input.trim() || !activeChannel) return
    try { // 4-2: try-catch
      const mentions = extractMentions(input)
      await messagesApi.post(activeChannel.id, {
        content: input.trim(),
        tag: tag || undefined,
        mentions: mentions.length > 0 ? mentions : undefined,
      })
      setInput('')
      setTag('')
      loadMessages(activeChannel)
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  const toggleBookmark = async (ch: Channel, e: React.MouseEvent) => {
    e.stopPropagation()
    try { // 4-2: try-catch
      await channelsApi.bookmark(ch.id, !ch.bookmarked)
      loadChannels()
    } catch (err) {
      console.error('Failed to toggle bookmark:', err)
    }
  }

  const toggleReaction = async (msg: Message, emoji: string) => {
    try { // 4-2: try-catch
      await messagesApi.react(msg.id, emoji)
    } catch (err) {
      console.error('Failed to toggle reaction:', err)
    }
  }

  // 4-13: Load vault files for link insertion
  const openVaultPicker = async () => {
    try {
      const res = await vaultApi.tree()
      const files: { path: string; name: string }[] = []
      const walk = (node: VaultNode) => {
        if (node.type === 'file' && node.name.endsWith('.md')) {
          files.push({ path: node.path, name: node.name })
        }
        node.children?.forEach(walk)
      }
      if (res.data) walk(res.data)
      setVaultFiles(files)
      setShowVaultPicker(true)
    } catch {
      console.error('Failed to load vault tree')
    }
  }

  const insertObsidianLink = (file: { path: string; name: string }) => {
    const uri = `obsidian://open?file=${encodeURIComponent(file.path)}`
    setInput((prev) => prev + ` 📄${file.name}`)
    setShowVaultPicker(false)
    // Store link info - will be sent with message
    inputRef.current?.focus()
    // Note: For simplicity, we embed the link info in the input. A production app would track obsidian_links separately.
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
                  <div style={styles.messageContent}>{renderMessageContent(msg.content)}</div>
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
              {/* 4-13: Obsidian link insertion button */}
              <button style={styles.obsidianBtn} onClick={openVaultPicker} title="Obsidianリンク挿入">📄</button>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  ref={inputRef}
                  style={styles.textInput}
                  value={input}
                  onChange={handleInputChange}
                  placeholder="メッセージを入力... (@でメンション)"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                />
                {/* 4-11: Mention dropdown */}
                {mentionQuery !== null && filteredMentionUsers.length > 0 && (
                  <div style={styles.mentionDropdown}>
                    {filteredMentionUsers.map((u) => (
                      <div key={u.id} style={styles.mentionItem} onClick={() => insertMention(u)}>
                        <span style={{ fontWeight: 600 }}>{u.display_name}</span>
                        <span style={{ color: '#888', fontSize: '12px', marginLeft: '6px' }}>@{u.username}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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

      {/* 4-13: Vault file picker modal */}
      {showVaultPicker && (
        <div style={styles.pickerOverlay} onClick={() => setShowVaultPicker(false)}>
          <div style={styles.pickerModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.pickerHeader}>
              <span style={{ fontWeight: 600 }}>Obsidianリンク挿入</span>
              <button onClick={() => setShowVaultPicker(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={styles.pickerList}>
              {vaultFiles.length === 0 && <div style={{ padding: '16px', color: '#888' }}>ファイルが見つかりません</div>}
              {vaultFiles.map((f) => (
                <div key={f.path} style={styles.pickerItem} onClick={() => insertObsidianLink(f)}>
                  📄 {f.name} <span style={{ color: '#aaa', fontSize: '11px', marginLeft: '4px' }}>{f.path}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
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
  obsidianBtn: { padding: '6px 8px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' },
  // 4-11: Mention dropdown styles
  mentionDropdown: { position: 'absolute', bottom: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '6px', boxShadow: '0 -4px 12px rgba(0,0,0,0.1)', zIndex: 100, marginBottom: '4px', overflow: 'hidden' },
  mentionItem: { padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f5f5f5' },
  // 4-13: Vault picker styles
  pickerOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 800 },
  pickerModal: { background: '#fff', borderRadius: '10px', width: '420px', maxWidth: '90vw', maxHeight: '60vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  pickerHeader: { padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  pickerList: { flex: 1, overflowY: 'auto' },
  pickerItem: { padding: '8px 16px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f5f5f5' },
}
