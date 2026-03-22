import React, { useState, useEffect, useCallback, useRef } from 'react'
import { dashboardApi, usersApi } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../hooks/useWebSocket'

// ── Widget types ────────────────────────────────────────────────────────

type WidgetId =
  | 'unread_messages'
  | 'follow_alerts'
  | 'week_milestones'
  | 'my_projects'
  | 'mini_gantt'
  | 'recent_notes'

interface WidgetDef {
  id: WidgetId
  label: string
  icon: string
  adminOnly: boolean
}

const ALL_WIDGETS: WidgetDef[] = [
  { id: 'unread_messages',  label: '未読メッセージ',          icon: '📋', adminOnly: false },
  { id: 'follow_alerts',    label: '要確認アラート',           icon: '⚠',  adminOnly: false },
  { id: 'week_milestones',  label: '今週のマイルストーン',     icon: '📅', adminOnly: false },
  { id: 'my_projects',      label: '自分の業務一覧',           icon: '📊', adminOnly: false },
  { id: 'mini_gantt',       label: 'ガント俯瞰（ミニ版）',     icon: '📈', adminOnly: true  },
  { id: 'recent_notes',     label: '最近更新されたnote',       icon: '📝', adminOnly: false },
]

interface DashboardData {
  unread_notifications: Notif[]
  stale_projects: StaleProject[]
  feeling_alerts: FeelingAlert[]
  week_milestones: WeekMilestone[]
  my_projects: MyProject[]
  recent_notes: RecentNote[]
  mini_gantt: MiniGanttItem[]
  today: string
  week_start: string
  week_end: string
}

interface Notif { id: string; type: string; title: string; body: string; link_type: string | null; link_id: string | null; created_at: string }
interface StaleProject { id: string; name: string; owner_name: string; last_note_date: string | null }
interface FeelingAlert { id: string; name: string; feeling: string; owner_name: string }
interface WeekMilestone { id: string; title: string; date: string; project_name: string }
interface MyProject { id: string; name: string; state: string; feeling: string }
interface RecentNote { id: string; date: string; obsidian_note_path: string; obsidian_uri: string | null; project_name: string }
interface MiniGanttItem { id: string; name: string; state: string; feeling: string; start_date: string; end_date: string; owner_name: string }

// ── Defaults ────────────────────────────────────────────────────────────

function defaultWidgets(isAdmin: boolean): WidgetId[] {
  return ALL_WIDGETS
    .filter((w) => isAdmin ? true : !w.adminOnly)
    .map((w) => w.id)
}

// ── Main Dashboard ──────────────────────────────────────────────────────

export default function DashboardTab() {
  const { user, token } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const isAdmin = user?.role === 'admin'

  // widget order/visibility from localStorage
  const storageKey = `trail_widgets_${user?.id}`
  const [activeWidgets, setActiveWidgets] = useState<WidgetId[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return defaultWidgets(isAdmin)
  })

  const saveWidgets = useCallback((widgets: WidgetId[]) => {
    setActiveWidgets(widgets)
    localStorage.setItem(storageKey, JSON.stringify(widgets))
    // persist to server (best-effort)
    usersApi.updateSettings(user!.id, widgets).catch(() => {})
  }, [storageKey, user])

  const load = useCallback(async () => {
    try {
      const res = await dashboardApi.get()
      setData(res.data)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useWebSocket(token, useCallback((evt) => {
    const d = evt as { type: string }
    if (['new_message', 'mention', 'note_synced', 'project_created', 'project_updated'].includes(d.type)) {
      load()
    }
  }, [load]))

  if (loading) return <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>読み込み中...</div>

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <h2 style={s.pageTitle}>ダッシュボード</h2>
        <button style={s.settingsBtn} onClick={() => setShowSettings(true)}>⚙ ウィジェット設定</button>
      </div>

      <div style={s.grid}>
        {activeWidgets.map((wid) => (
          <WidgetShell key={wid} wid={wid} data={data} isAdmin={isAdmin} />
        ))}
      </div>

      {showSettings && (
        <WidgetSettings
          allWidgets={ALL_WIDGETS}
          activeWidgets={activeWidgets}
          isAdmin={isAdmin}
          onSave={(ids) => { saveWidgets(ids); setShowSettings(false) }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

// ── Widget Shell ────────────────────────────────────────────────────────

function WidgetShell({ wid, data, isAdmin }: { wid: WidgetId; data: DashboardData | null; isAdmin: boolean }) {
  const def = ALL_WIDGETS.find((w) => w.id === wid)!
  if (!data) return null

  const content = (() => {
    switch (wid) {
      case 'unread_messages':  return <UnreadWidget data={data} />
      case 'follow_alerts':    return <AlertsWidget data={data} isAdmin={isAdmin} />
      case 'week_milestones':  return <MilestonesWidget data={data} />
      case 'my_projects':      return <MyProjectsWidget data={data} />
      case 'mini_gantt':       return <MiniGanttWidget data={data} />
      case 'recent_notes':     return <RecentNotesWidget data={data} />
    }
  })()

  return (
    <div style={s.widget}>
      <div style={s.widgetHeader}>
        <span style={s.widgetIcon}>{def.icon}</span>
        <span style={s.widgetTitle}>{def.label}</span>
      </div>
      <div style={s.widgetBody}>{content}</div>
    </div>
  )
}

// ── Widget: Unread messages ─────────────────────────────────────────────

function UnreadWidget({ data }: { data: DashboardData }) {
  const TYPE_ICONS: Record<string, string> = {
    mention: '💬', message: '📢', follow_alert: '⚠', project_created: '📁',
  }
  if (data.unread_notifications.length === 0) {
    return <Empty text="未読通知なし" />
  }
  return (
    <div style={s.list}>
      {data.unread_notifications.map((n) => (
        <div key={n.id} style={s.listItem}>
          <span style={s.listIcon}>{TYPE_ICONS[n.type] || '📢'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={s.listTitle}>{n.title}</div>
            <div style={s.listSub}>{n.body}</div>
          </div>
          <div style={s.listTime}>{fmtDate(n.created_at)}</div>
        </div>
      ))}
    </div>
  )
}

// ── Widget: Follow alerts ───────────────────────────────────────────────

function AlertsWidget({ data }: { data: DashboardData; isAdmin?: boolean }) {
  const stale = data.stale_projects
  const feeling = data.feeling_alerts

  if (stale.length === 0 && feeling.length === 0) return <Empty text="要確認アラートなし ✓" />

  return (
    <div style={s.list}>
      {stale.map((p) => (
        <div key={`stale-${p.id}`} style={{ ...s.listItem, borderLeft: '3px solid #ff7043' }}>
          <span style={s.listIcon}>📁</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={s.listTitle}>{p.name}</div>
            <div style={s.listSub}>
              {p.last_note_date
                ? `最終note: ${p.last_note_date}（${p.owner_name}）`
                : `noteがありません（${p.owner_name}）`}
            </div>
          </div>
          <div style={{ ...s.listTime, color: '#ff7043', fontWeight: 600 }}>更新なし</div>
        </div>
      ))}
      {feeling.map((p) => (
        <div key={`feeling-${p.id}`} style={{ ...s.listItem, borderLeft: '3px solid #7b1fa2' }}>
          <span style={s.listIcon}>{p.feeling === '相談したい' ? '💬' : '⚠'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={s.listTitle}>{p.name}</div>
            <div style={s.listSub}>{p.owner_name}</div>
          </div>
          <div style={{ ...s.listTime, color: '#7b1fa2', fontWeight: 600 }}>{p.feeling}</div>
        </div>
      ))}
    </div>
  )
}

// ── Widget: Week milestones ─────────────────────────────────────────────

function MilestonesWidget({ data }: { data: DashboardData }) {
  const today = data.today
  if (data.week_milestones.length === 0) return <Empty text="今週のマイルストーンなし" />

  return (
    <div style={s.list}>
      {data.week_milestones.map((m) => (
        <div key={m.id} style={{ ...s.listItem, ...(m.date === today ? { background: '#fff9c4' } : {}) }}>
          <span style={{ ...s.listIcon, color: '#f57f17' }}>◆</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={s.listTitle}>{m.title}</div>
            <div style={s.listSub}>{m.project_name}</div>
          </div>
          <div style={{ ...s.listTime, fontWeight: m.date === today ? 700 : 400, color: m.date === today ? '#e65100' : '#999' }}>
            {fmtDayOfWeek(m.date)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Widget: My projects ─────────────────────────────────────────────────

const STATE_ICONS: Record<string, string> = { '進行中': '🔵', '待機中': '⚪', '完了': '🟢' }
const FEELING_ICONS: Record<string, string> = { '順調': '✓', 'やや不安': '△', '遅延しそう': '⚠', '相談したい': '💬' }
const FEELING_COLORS: Record<string, string> = { '順調': '#2e7d32', 'やや不安': '#f57f17', '遅延しそう': '#c62828', '相談したい': '#6a1b9a' }

function MyProjectsWidget({ data }: { data: DashboardData }) {
  if (data.my_projects.length === 0) return <Empty text="担当業務なし" />
  return (
    <div style={s.list}>
      {data.my_projects.map((p) => (
        <div key={p.id} style={s.listItem}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={s.listTitle}>{p.name}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '14px' }}>{STATE_ICONS[p.state]}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: FEELING_COLORS[p.feeling] || '#333' }}>
              {FEELING_ICONS[p.feeling]}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Widget: Mini gantt ──────────────────────────────────────────────────

function MiniGanttWidget({ data }: { data: DashboardData }) {
  if (data.mini_gantt.length === 0) return <Empty text="アクティブなプロジェクトなし" />

  const items = data.mini_gantt
  const allDates = items.flatMap((p) => [new Date(p.start_date), new Date(p.end_date)])
  const minD = new Date(Math.min(...allDates.map((d) => d.getTime())))
  const maxD = new Date(Math.max(...allDates.map((d) => d.getTime())))
  const total = Math.max(Math.ceil((maxD.getTime() - minD.getTime()) / 86400000) + 1, 1)
  const today = new Date()

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <tbody>
          {items.map((p) => {
            const startOff = Math.max(Math.floor((new Date(p.start_date).getTime() - minD.getTime()) / 86400000), 0)
            const endOff = Math.min(Math.floor((new Date(p.end_date).getTime() - minD.getTime()) / 86400000), total - 1)
            const startPct = (startOff / total) * 100
            const widthPct = Math.max(((endOff - startOff + 1) / total) * 100, 2)
            const todayPct = ((today.getTime() - minD.getTime()) / 86400000 / total) * 100

            return (
              <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '4px 8px', whiteSpace: 'nowrap', width: '35%', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span title={p.name}>{STATE_ICONS[p.state]} {p.name}</span>
                </td>
                <td style={{ padding: '4px 4px', position: 'relative', height: '20px' }}>
                  <div style={{ position: 'relative', height: '12px', background: '#f0f0f0', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: `${startPct}%`, width: `${widthPct}%`, height: '100%', background: p.state === '完了' ? '#4caf50' : p.state === '待機中' ? '#bdbdbd' : '#1565c0', borderRadius: '6px' }} />
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: '2px', background: '#f44336' }} />
                    )}
                  </div>
                </td>
                <td style={{ padding: '4px 4px', whiteSpace: 'nowrap', fontSize: '11px', color: '#aaa' }}>
                  {fmtShort(p.end_date)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Widget: Recent notes ────────────────────────────────────────────────

function RecentNotesWidget({ data }: { data: DashboardData }) {
  if (data.recent_notes.length === 0) return <Empty text="最近更新されたnoteなし" />
  return (
    <div style={s.list}>
      {data.recent_notes.map((n) => (
        <div key={n.id} style={s.listItem}>
          <span style={s.listIcon}>📄</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={s.listTitle}>{n.obsidian_note_path.split('/').pop()}</div>
            <div style={s.listSub}>{n.project_name}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <span style={s.listTime}>{n.date}</span>
            {n.obsidian_uri && (
              <a href={n.obsidian_uri} style={{ fontSize: '14px', textDecoration: 'none' }} title="Obsidianで開く">🔗</a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Widget Settings Modal ───────────────────────────────────────────────

interface WidgetSettingsProps {
  allWidgets: WidgetDef[]
  activeWidgets: WidgetId[]
  isAdmin: boolean
  onSave: (ids: WidgetId[]) => void
  onClose: () => void
}

function WidgetSettings({ allWidgets, activeWidgets, isAdmin, onSave, onClose }: WidgetSettingsProps) {
  const available = allWidgets.filter((w) => isAdmin || !w.adminOnly)
  const [order, setOrder] = useState<WidgetId[]>(activeWidgets.filter((id) => available.some((w) => w.id === id)))
  const [enabled, setEnabled] = useState<Set<WidgetId>>(new Set(activeWidgets))
  const dragging = useRef<WidgetId | null>(null)
  const dragOver = useRef<WidgetId | null>(null)

  const toggle = (id: WidgetId) => {
    setEnabled((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleDragStart = (id: WidgetId) => { dragging.current = id }
  const handleDragEnter = (id: WidgetId) => { dragOver.current = id }
  const handleDragEnd = () => {
    if (!dragging.current || !dragOver.current || dragging.current === dragOver.current) return
    setOrder((prev) => {
      const next = [...prev.filter((id) => available.some((w) => w.id === id))]
      // ensure all available widgets are in list
      for (const w of available) {
        if (!next.includes(w.id)) next.push(w.id)
      }
      const fromIdx = next.indexOf(dragging.current!)
      const toIdx = next.indexOf(dragOver.current!)
      if (fromIdx !== -1 && toIdx !== -1) {
        next.splice(fromIdx, 1)
        next.splice(toIdx, 0, dragging.current!)
      }
      return next
    })
    dragging.current = null
    dragOver.current = null
  }

  const save = () => {
    // ensure all available widgets have an order entry
    const allIds = [...new Set([...order, ...available.map((w) => w.id)])]
    onSave(allIds.filter((id) => enabled.has(id)))
  }

  const displayOrder = [...new Set([...order, ...available.map((w) => w.id)])].filter((id) => available.some((w) => w.id === id))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: '10px', width: '440px', maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1a237e', flex: 1 }}>ウィジェット設定</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '12px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#666' }}>ドラッグで並び替え、チェックで表示/非表示</p>
          {displayOrder.map((id) => {
            const def = available.find((w) => w.id === id)
            if (!def) return null
            return (
              <div
                key={id}
                draggable
                onDragStart={() => handleDragStart(id)}
                onDragEnter={() => handleDragEnter(id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '6px', background: '#f9f9f9', borderRadius: '6px', cursor: 'grab', border: '1px solid #e8e8e8', userSelect: 'none' }}
              >
                <span style={{ color: '#bbb', fontSize: '16px', cursor: 'grab' }}>⠿</span>
                <span style={{ fontSize: '16px' }}>{def.icon}</span>
                <span style={{ flex: 1, fontSize: '14px' }}>{def.label}</span>
                {def.adminOnly && <span style={{ fontSize: '11px', color: '#7b1fa2', background: '#f3e5f5', padding: '1px 6px', borderRadius: '8px' }}>管理者</span>}
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={enabled.has(id)} onChange={() => toggle(id)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                </label>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', background: '#fff' }}>キャンセル</button>
          <button onClick={save} style={{ padding: '8px 24px', background: '#1a237e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>保存</button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

function Empty({ text }: { text: string }) {
  return <div style={{ padding: '16px', color: '#aaa', textAlign: 'center', fontSize: '13px' }}>{text}</div>
}

function fmtDate(dt: string) {
  if (!dt) return ''
  const d = new Date(dt)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function fmtShort(dt: string) {
  const [, m, day] = dt.split('-')
  return `${parseInt(m)}/${parseInt(day)}`
}

function fmtDayOfWeek(dt: string) {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const d = new Date(dt)
  const [, m, day] = dt.split('-')
  return `${parseInt(m)}/${parseInt(day)}(${days[d.getDay()]})`
}

// ── Styles ──────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: '16px 20px', height: 'calc(100vh - 92px)', overflowY: 'auto', background: '#f5f5f5' },
  topBar: { display: 'flex', alignItems: 'center', marginBottom: '16px' },
  pageTitle: { margin: 0, fontSize: '20px', fontWeight: 700, color: '#1a237e', flex: 1 },
  settingsBtn: { padding: '6px 14px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: '#fff' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' },
  widget: { background: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' },
  widgetHeader: { padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '8px', background: '#fafafa' },
  widgetIcon: { fontSize: '16px' },
  widgetTitle: { fontSize: '14px', fontWeight: 700, color: '#333' },
  widgetBody: { padding: '0' },
  list: { display: 'flex', flexDirection: 'column' },
  listItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid #f5f5f5', minWidth: 0 },
  listIcon: { fontSize: '16px', flexShrink: 0 },
  listTitle: { fontSize: '13px', fontWeight: 500, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  listSub: { fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  listTime: { fontSize: '11px', color: '#bbb', flexShrink: 0 },
}
