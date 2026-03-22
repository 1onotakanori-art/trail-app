import React, { useState, useRef, useEffect } from 'react'
import { GanttProject, Task, Dependency } from '../types'
import { ParentPopover, ChildPopover } from './GanttPopover'
import { dailyLogsApi, projectsApi } from '../api/client'

interface Props {
  projects: GanttProject[]
  viewMode?: 'all' | 'personal' | 'tag'
  selectedOwner?: string
  onRefresh: () => void
}

const DAY_W = 38    // px per day
const ROW_H = 36
const LABEL_W = 260
const HEADER_H = 48

const STATE_ICONS: Record<string, string> = { '進行中': '🔵', '待機中': '⚪', '完了': '🟢' }
const FEELING_ICONS: Record<string, string> = { '順調': '✓', 'やや不安': '△', '遅延しそう': '⚠', '相談したい': '💬' }
const PROGRESS_COLORS: Record<number, string> = {
  100: '#1565c0', 80: '#42a5f5', 60: '#90caf9', 40: '#bbdefb', 20: '#e3f2fd', 0: '#bdbdbd',
}

function dateToIndex(start: Date, date: Date) {
  return Math.floor((date.getTime() - start.getTime()) / 86400000)
}

function isoToDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatDate(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function GanttChart({ projects, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [popover, setPopover] = useState<{ type: 'parent' | 'child'; projectId: string; taskId?: string; date: string; rect: DOMRect; progress?: number } | null>(null)
  const [stateModal, setStateModal] = useState<{ projectId: string; field: 'state' | 'feeling'; rect: DOMRect } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // compute date range
  const allDates = projects.flatMap((p) => [isoToDate(p.start_date), isoToDate(p.end_date)])
  const minDate = allDates.length ? new Date(Math.min(...allDates.map((d) => d.getTime()))) : new Date()
  const maxDate = allDates.length ? new Date(Math.max(...allDates.map((d) => d.getTime()))) : new Date()
  // expand range
  minDate.setDate(minDate.getDate() - 3)
  maxDate.setDate(maxDate.getDate() + 7)
  const totalDays = Math.max(dateToIndex(minDate, maxDate), 1) + 1
  const today = new Date()

  const toggleExpand = (pid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(pid) ? next.delete(pid) : next.add(pid)
      return next
    })
  }

  const handleCellClick = (e: React.MouseEvent, type: 'parent' | 'child', projectId: string, date: string, taskId?: string, progress?: number) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setPopover({ type, projectId, taskId, date, rect, progress })
  }

  const handleStateClick = (e: React.MouseEvent, projectId: string, field: 'state' | 'feeling') => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setStateModal({ projectId, field, rect })
  }

  const updateStateFeeling = async (projectId: string, field: string, value: string) => {
    await projectsApi.update(projectId, { [field]: value })
    setStateModal(null)
    onRefresh()
  }

  // render rows
  const rows: React.ReactNode[] = []

  for (const project of projects) {
    const isExpanded = expanded.has(project.id)
    const logsByDate = Object.fromEntries(project.daily_logs.map((l) => [l.date, l]))

    // parent row
    const projStart = isoToDate(project.start_date)
    const projEnd = isoToDate(project.end_date)
    const startIdx = Math.max(dateToIndex(minDate, projStart), 0)
    const endIdx = Math.min(dateToIndex(minDate, projEnd), totalDays - 1)

    rows.push(
      <div key={`proj-${project.id}`} style={{ display: 'flex', height: ROW_H, alignItems: 'center', borderBottom: '1px solid #e8e8e8', background: isExpanded ? '#f8f9ff' : '#fff' }}>
        {/* label */}
        <div style={{ width: LABEL_W, minWidth: LABEL_W, padding: '0 8px', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', borderRight: '1px solid #e0e0e0', height: '100%' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#666', padding: 0, width: '14px' }} onClick={() => toggleExpand(project.id)}>
            {project.tasks.length > 0 ? (isExpanded ? '▼' : '▶') : ' '}
          </button>
          <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
          <button style={iconBtn} onClick={(e) => handleStateClick(e, project.id, 'state')} title="State">{STATE_ICONS[project.state]}</button>
          <button style={iconBtn} onClick={(e) => handleStateClick(e, project.id, 'feeling')} title="Feeling">{FEELING_ICONS[project.feeling]}</button>
        </div>
        {/* cells */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', height: '100%' }}>
          {Array.from({ length: totalDays }, (_, i) => {
            const d = addDays(minDate, i)
            const dStr = d.toISOString().slice(0, 10)
            const inRange = i >= startIdx && i <= endIdx
            const hasLog = !!logsByDate[dStr]
            const isToday = dStr === today.toISOString().slice(0, 10)
            return (
              <div
                key={i}
                style={{
                  width: DAY_W, minWidth: DAY_W, height: '100%',
                  background: isToday ? '#fff9c4' : inRange ? '#e8eaf6' : 'transparent',
                  borderRight: '1px solid #f0f0f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: inRange ? 'pointer' : 'default',
                  position: 'relative',
                }}
                onClick={inRange ? (e) => handleCellClick(e, 'parent', project.id, dStr) : undefined}
              >
                {hasLog && <span style={{ fontSize: '10px', color: '#1565c0', fontWeight: 'bold' }}>●</span>}
              </div>
            )
          })}
          {/* milestones */}
          {project.milestones.map((ms) => {
            const idx = dateToIndex(minDate, isoToDate(ms.date))
            if (idx < 0 || idx >= totalDays) return null
            return (
              <div key={ms.id} style={{ position: 'absolute', left: idx * DAY_W + DAY_W / 2 - 7, top: '50%', transform: 'translateY(-50%)', fontSize: '14px', zIndex: 5, cursor: 'help', userSelect: 'none' }} title={ms.title}>◆</div>
            )
          })}
        </div>
      </div>
    )

    // child rows
    if (isExpanded) {
      for (const task of project.tasks) {
        const tStart = isoToDate(task.planned_start)
        const tEnd = isoToDate(task.planned_end)
        const tStartIdx = Math.max(dateToIndex(minDate, tStart), 0)
        const tEndIdx = Math.min(dateToIndex(minDate, tEnd), totalDays - 1)

        rows.push(
          <div key={`task-${task.id}`} style={{ display: 'flex', height: ROW_H, alignItems: 'center', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W, padding: '0 8px 0 32px', display: 'flex', alignItems: 'center', overflow: 'hidden', borderRight: '1px solid #e0e0e0', height: '100%', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: '#888', marginRight: '4px' }}>├</span>
              <span style={{ flex: 1, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
              <span style={{ fontSize: '11px', color: task.status === '完了' ? '#2e7d32' : task.status === '進行中' ? '#1565c0' : '#999' }}>
                {task.status === '完了' ? '✓' : task.status === '進行中' ? '▶' : '○'}
              </span>
            </div>
            <div style={{ flex: 1, display: 'flex', position: 'relative', height: '100%' }}>
              {Array.from({ length: totalDays }, (_, i) => {
                const d = addDays(minDate, i)
                const dStr = d.toISOString().slice(0, 10)
                const inRange = i >= tStartIdx && i <= tEndIdx
                const isToday = dStr === today.toISOString().slice(0, 10)
                const progress = inRange ? (task.daily_progress?.[dStr] ?? 100) : -1
                const bgColor = progress >= 0 ? PROGRESS_COLORS[progress] : 'transparent'

                return (
                  <div
                    key={i}
                    style={{
                      width: DAY_W, minWidth: DAY_W, height: '100%',
                      background: inRange ? bgColor : isToday ? '#fff9c4' : 'transparent',
                      borderRight: '1px solid #f0f0f0',
                      cursor: inRange ? 'pointer' : 'default',
                    }}
                    onClick={inRange ? (e) => handleCellClick(e, 'child', project.id, dStr, task.id, progress) : undefined}
                  />
                )
              })}
              {/* dependency arrows SVG */}
              <DependencyArrows tasks={project.tasks} deps={project.dependencies} minDate={minDate} totalDays={totalDays} />
            </div>
          </div>
        )
      }

      // weekly summary section
      rows.push(
        <WeeklySummaryRow key={`ws-${project.id}`} project={project} minDate={minDate} onRefresh={onRefresh} />
      )
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }} ref={containerRef}>
      {/* Header row */}
      <div style={{ display: 'flex', height: HEADER_H, borderBottom: '2px solid #c5cae9', background: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ width: LABEL_W, minWidth: LABEL_W, padding: '0 8px', display: 'flex', alignItems: 'center', fontWeight: 600, fontSize: '13px', color: '#555', borderRight: '1px solid #e0e0e0' }}>
          業務名
        </div>
        <div style={{ flex: 1, display: 'flex', overflowX: 'hidden' }}>
          {Array.from({ length: totalDays }, (_, i) => {
            const d = addDays(minDate, i)
            const isToday = d.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)
            const isMonday = d.getDay() === 1
            return (
              <div
                key={i}
                style={{
                  width: DAY_W, minWidth: DAY_W, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', fontSize: '10px',
                  color: isToday ? '#1565c0' : '#888',
                  fontWeight: isToday || isMonday ? 700 : 400,
                  borderRight: '1px solid #f0f0f0',
                  background: isToday ? '#fff9c4' : 'transparent',
                }}
              >
                {isMonday && <span style={{ fontSize: '9px', color: '#aaa' }}>{d.getMonth() + 1}月</span>}
                <span>{formatDate(d)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Rows (scrollable) */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {projects.length === 0
          ? <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>プロジェクトがありません</div>
          : rows
        }
      </div>

      {/* Popovers */}
      {popover && popover.type === 'parent' && (
        <ParentPopover
          projectId={popover.projectId}
          date={popover.date}
          anchorRect={popover.rect}
          onClose={() => setPopover(null)}
        />
      )}
      {popover && popover.type === 'child' && popover.taskId && (
        <ChildPopover
          taskId={popover.taskId}
          date={popover.date}
          currentProgress={popover.progress ?? 100}
          anchorRect={popover.rect}
          onClose={() => setPopover(null)}
          onProgressChange={() => { setPopover(null); onRefresh() }}
        />
      )}

      {/* State/Feeling modal */}
      {stateModal && (
        <StateModal
          projectId={stateModal.projectId}
          field={stateModal.field}
          rect={stateModal.rect}
          onSelect={(v) => updateStateFeeling(stateModal.projectId, stateModal.field, v)}
          onClose={() => setStateModal(null)}
        />
      )}
    </div>
  )
}

// ── Dependency arrows ────────────────────────────────────────────────────

function DependencyArrows({ tasks, deps, minDate, totalDays }: { tasks: Task[]; deps: Dependency[]; minDate: Date; totalDays: number }) {
  const taskMap = Object.fromEntries(tasks.map((t) => [t.id, t]))
  if (!deps.length) return null

  const lines = deps.map((dep) => {
    const pred = taskMap[dep.predecessor_id]
    const succ = taskMap[dep.successor_id]
    if (!pred || !succ) return null
    const predEndIdx = dateToIndex(minDate, isoToDate(pred.planned_end))
    const succStartIdx = dateToIndex(minDate, isoToDate(succ.planned_start))
    const predRow = tasks.indexOf(pred)
    const succRow = tasks.indexOf(succ)
    if (predRow === -1 || succRow === -1) return null

    const x1 = predEndIdx * DAY_W + DAY_W
    const y1 = predRow * ROW_H + ROW_H / 2
    const x2 = succStartIdx * DAY_W
    const y2 = succRow * ROW_H + ROW_H / 2

    return (
      <g key={dep.id}>
        <path
          d={`M${x1},${y1} C${x1 + 20},${y1} ${x2 - 20},${y2} ${x2},${y2}`}
          fill="none" stroke="#1565c0" strokeWidth="1.5" markerEnd="url(#arrow)"
        />
      </g>
    )
  }).filter(Boolean)

  if (!lines.length) return null
  const svgW = totalDays * DAY_W
  const svgH = tasks.length * ROW_H

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }} width={svgW} height={svgH}>
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#1565c0" />
        </marker>
      </defs>
      {lines}
    </svg>
  )
}

// ── State/Feeling modal ─────────────────────────────────────────────────

function StateModal({ field, rect, onSelect, onClose }: { projectId?: string; field: string; rect: DOMRect; onSelect: (v: string) => void; onClose: () => void }) {
  const options = field === 'state'
    ? ['進行中', '待機中', '完了']
    : ['順調', 'やや不安', '遅延しそう', '相談したい']
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return (
    <div ref={ref} style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, background: '#fff', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 600, overflow: 'hidden', minWidth: '140px' }}>
      {options.map((opt) => (
        <div key={opt} style={{ padding: '10px 16px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f5f5f5' }}
          onClick={() => onSelect(opt)}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f5')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '')}
        >
          {field === 'state' ? (STATE_ICONS[opt] + ' ' + opt) : (FEELING_ICONS[opt] + ' ' + opt)}
        </div>
      ))}
    </div>
  )
}

// ── Weekly summary row ──────────────────────────────────────────────────

function WeeklySummaryRow({ project, minDate }: { project: GanttProject; minDate: Date; onRefresh: () => void }) {
  const [summaries, setSummaries] = useState<{ week_start: string; content: string }[]>([])
  const [activeWeek, setActiveWeek] = useState<string>('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    dailyLogsApi.listWeekly(project.id).then((res) => {
      setSummaries(res.data)
      if (res.data.length > 0) setActiveWeek(res.data[res.data.length - 1].week_start)
    })
  }, [project.id])

  // build week tabs from date range
  const weeks: string[] = []
  const d = new Date(minDate)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  const maxD = new Date()
  maxD.setDate(maxD.getDate() + 14)
  while (d <= maxD) {
    weeks.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 7)
  }

  const currentSummary = summaries.find((s) => s.week_start === activeWeek)

  const save = async () => {
    if (!activeWeek) return
    await dailyLogsApi.upsertWeekly(project.id, activeWeek, { content: editContent, source: 'manual' })
    setSummaries((prev) => {
      const idx = prev.findIndex((s) => s.week_start === activeWeek)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { week_start: activeWeek, content: editContent }
        return next
      }
      return [...prev, { week_start: activeWeek, content: editContent }]
    })
    setEditing(false)
  }

  return (
    <div style={{ background: '#f8f9ff', borderBottom: '2px solid #c5cae9', padding: '10px 12px 10px' + LABEL_W }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', paddingLeft: LABEL_W }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>📋 週次サマリー</span>
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
          {weeks.map((w) => {
            const d = new Date(w)
            const label = `${d.getMonth() + 1}/${d.getDate()}週`
            const hasSummary = summaries.some((s) => s.week_start === w)
            return (
              <button key={w} onClick={() => { setActiveWeek(w); setEditing(false) }}
                style={{ padding: '3px 10px', border: '1px solid', borderColor: activeWeek === w ? '#1565c0' : '#ddd', borderRadius: '12px', cursor: 'pointer', fontSize: '12px', background: activeWeek === w ? '#e3f2fd' : '#fff', fontWeight: hasSummary ? 600 : 400 }}>
                {label}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ marginLeft: LABEL_W, background: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px', padding: '10px 12px' }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
              style={{ width: '100%', minHeight: '80px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit' }} autoFocus />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={save} style={{ padding: '4px 12px', background: '#1a237e', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>保存</button>
              <button onClick={() => setEditing(false)} style={{ padding: '4px 12px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>キャンセル</button>
            </div>
          </div>
        ) : (
          <div>
            {currentSummary?.content
              ? <p style={{ margin: 0, fontSize: '13px', whiteSpace: 'pre-wrap', color: '#333' }}>{currentSummary.content}</p>
              : <p style={{ margin: 0, fontSize: '13px', color: '#aaa' }}>（サマリーなし）</p>
            }
            {/* note links for this week */}
            {project.daily_logs.filter((l) => {
              if (!activeWeek || !l.obsidian_note_path) return false
              const wd = new Date(activeWeek)
              const ld = new Date(l.date)
              const wEnd = new Date(wd); wEnd.setDate(wd.getDate() + 6)
              return ld >= wd && ld <= wEnd
            }).map((l) => (
              <div key={l.id} style={{ fontSize: '12px', color: '#1565c0', marginTop: '4px' }}>
                📄 {l.obsidian_note_path?.split('/').pop()}
                {l.obsidian_uri && <a href={l.obsidian_uri} style={{ marginLeft: '6px' }}>🔗</a>}
              </div>
            ))}
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
              <button onClick={() => { setEditContent(currentSummary?.content || ''); setEditing(true) }}
                style={{ padding: '3px 10px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                ✏ 編集
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }
