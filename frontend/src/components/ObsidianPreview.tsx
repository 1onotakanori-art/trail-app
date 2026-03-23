import React, { useEffect, useState, useRef } from 'react'
import { FileText, Link } from 'lucide-react'
import { vaultApi } from '../api/client'

interface Props {
  path: string
  onClose: () => void
  initialPos?: { x: number; y: number }
}

export default function ObsidianPreview({ path, onClose, initialPos }: Props) {
  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(true)
  const [pos, setPos] = useState(initialPos || { x: 100, y: 80 })
  const [size] = useState({ w: 520, h: 420 })
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })
  // 4-3: Track listeners for cleanup
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // 4-2: try-catch for API call
    vaultApi.preview(path).then((res) => {
      setHtml(typeof res.data === 'string' ? res.data : '')
      setLoading(false)
    }).catch(() => { setLoading(false); setHtml('<p style="color:red">プレビューを取得できませんでした</p>') })
  }, [path])

  // 4-3: Cleanup drag listeners on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current()
    }
  }, [])

  const startDrag = (e: React.MouseEvent) => {
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      setPos({ x: dragStart.current.px + ev.clientX - dragStart.current.mx, y: dragStart.current.py + ev.clientY - dragStart.current.my })
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      cleanupRef.current = null
    }
    // Cleanup previous listeners if any
    if (cleanupRef.current) cleanupRef.current()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    cleanupRef.current = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }

  const obsidianUri = `obsidian://open?file=${encodeURIComponent(path)}`

  return (
    <div
      style={{
        position: 'fixed', left: pos.x, top: pos.y,
        width: size.w, height: size.h,
        background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 1000,
        display: 'flex', flexDirection: 'column', resize: 'both', overflow: 'hidden',
      }}
    >
      {/* title bar */}
      <div
        style={{ padding: '8px 12px', background: '#1a237e', color: '#fff', cursor: 'move', display: 'flex', alignItems: 'center', gap: '8px', userSelect: 'none' }}
        onMouseDown={startDrag}
      >
        <span style={{ flex: 1, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <FileText size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {path.split('/').pop()}
        </span>
        <a href={obsidianUri} style={{ color: '#fff', fontSize: '14px', textDecoration: 'none', display: 'flex', alignItems: 'center' }} title="Obsidianで開く"><Link size={14} /></a>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '16px', padding: 0, lineHeight: 1 }}>×</button>
      </div>
      {/* content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading
          ? <p style={{ padding: '16px', color: '#888' }}>読み込み中...</p>
          : <iframe
              srcDoc={html}
              style={{ width: '100%', height: '100%', border: 'none' }}
              sandbox="allow-same-origin"
              title="preview"
            />
        }
      </div>
      {/* 4-24: Resize handle indicator */}
      <div style={{
        position: 'absolute', bottom: 0, right: 0, width: '16px', height: '16px',
        cursor: 'nwse-resize', opacity: 0.5,
        background: 'linear-gradient(135deg, transparent 50%, #999 50%, transparent 52%, #999 62%, transparent 64%, #999 74%)',
      }} title="リサイズ" />
    </div>
  )
}
