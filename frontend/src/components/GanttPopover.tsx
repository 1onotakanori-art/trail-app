import React, { useState, useEffect, useRef } from 'react'
import { DailyLog } from '../types'
import { ganttApi, tasksApi, dailyLogsApi } from '../api/client'
import ObsidianPreview from './ObsidianPreview'

interface ParentPopoverProps {
  projectId: string
  date: string
  anchorRect: DOMRect
  onClose: () => void
}

export function ParentPopover({ projectId, date, anchorRect, onClose }: ParentPopoverProps) {
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [comment, setComment] = useState('')
  const [editingComment, setEditingComment] = useState(false)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 4-2: try-catch for API call
    ganttApi.getDaily(projectId, date).then((res) => {
      setLogs(res.data)
      const existing = res.data.find((l: DailyLog) => l.comment)
      if (existing) setComment(existing.comment || '')
    }).catch((err) => console.error('Failed to load daily data:', err))
  }, [projectId, date])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const saveComment = async () => {
    try { // 4-2: try-catch
      await dailyLogsApi.create(projectId, { date, comment })
      setEditingComment(false)
    } catch (err) {
      console.error('Failed to save comment:', err)
    }
  }

  const top = anchorRect.bottom + window.scrollY + 4
  const left = Math.min(anchorRect.left + window.scrollX, window.innerWidth - 300)

  return (
    <div ref={ref} style={{ position: 'fixed', top, left, background: '#fff', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: '260px', maxWidth: '320px', zIndex: 500, padding: '10px 12px' }}>
      {logs.filter(l => l.obsidian_note_path).map((log) => (
        <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '13px' }}>
          <span>📄 {log.obsidian_note_path?.split('/').pop()}</span>
          <button style={btnStyle} onClick={() => setPreviewPath(log.obsidian_note_path!)}>👁</button>
          {log.obsidian_uri && <a href={log.obsidian_uri} style={{ fontSize: '13px', textDecoration: 'none' }}>🔗</a>}
        </div>
      ))}
      <hr style={{ margin: '6px 0', border: 'none', borderTop: '1px solid #eee' }} />
      {editingComment ? (
        <div style={{ display: 'flex', gap: '4px' }}>
          <input value={comment} onChange={(e) => setComment(e.target.value)} style={{ flex: 1, padding: '4px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' }} autoFocus />
          <button onClick={saveComment} style={btnStyle}>保存</button>
        </div>
      ) : (
        <div style={{ fontSize: '13px', color: '#555' }}>
          {comment ? <span>💬 {comment}</span> : null}
          <button style={{ ...btnStyle, color: '#1565c0', marginLeft: comment ? '8px' : 0 }} onClick={() => setEditingComment(true)}>
            {comment ? '編集' : '＋ コメント追加'}
          </button>
        </div>
      )}
      {previewPath && <ObsidianPreview path={previewPath} onClose={() => setPreviewPath(null)} />}
    </div>
  )
}

interface ChildPopoverProps {
  taskId: string
  date: string
  currentProgress: number
  anchorRect: DOMRect
  onClose: () => void
  onProgressChange: (progress: number) => void
}

const PROGRESS_STEPS = [0, 20, 40, 60, 80, 100]

export function ChildPopover({ taskId, date, currentProgress, anchorRect, onClose, onProgressChange }: ChildPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleProgress = async (p: number) => {
    try { // 4-2: try-catch
      await tasksApi.setProgress(taskId, date, p)
      onProgressChange(p)
      onClose()
    } catch (err) {
      console.error('Failed to set progress:', err)
    }
  }

  const top = anchorRect.bottom + window.scrollY + 4
  const left = Math.min(anchorRect.left + window.scrollX, window.innerWidth - 260)

  return (
    <div ref={ref} style={{ position: 'fixed', top, left, background: '#fff', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', width: '240px', zIndex: 500, padding: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#333' }}>進捗度</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px', color: '#888' }}>0%</span>
        <div style={{ flex: 1, position: 'relative', height: '20px', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', width: '100%', height: '4px', background: '#e0e0e0', borderRadius: '2px' }} />
          <div style={{ position: 'absolute', width: `${currentProgress}%`, height: '4px', background: '#1565c0', borderRadius: '2px' }} />
          <input
            type="range" min={0} max={100} step={20} value={currentProgress}
            onChange={(e) => handleProgress(Number(e.target.value))}
            style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'pointer', height: '20px' }}
          />
          <div style={{ position: 'absolute', left: `${currentProgress}%`, width: '14px', height: '14px', background: '#1565c0', borderRadius: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }} />
        </div>
        <span style={{ fontSize: '12px', color: '#888' }}>100%</span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1565c0', minWidth: '36px', textAlign: 'right' }}>{currentProgress}%</span>
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {PROGRESS_STEPS.map((p) => (
          <button
            key={p}
            style={{ flex: 1, padding: '3px 0', border: `1px solid ${currentProgress === p ? '#1565c0' : '#ddd'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '11px', background: currentProgress === p ? '#e3f2fd' : '#fff' }}
            onClick={() => handleProgress(p)}
          >
            {p}%
          </button>
        ))}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: '13px' }
