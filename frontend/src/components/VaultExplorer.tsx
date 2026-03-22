import React, { useState, useEffect, useCallback } from 'react'
import { VaultNode } from '../types'
import { vaultApi } from '../api/client'
import ObsidianPreview from './ObsidianPreview'

interface Props {
  onClose: () => void
}

export default function VaultExplorer({ onClose }: Props) {
  const [tree, setTree] = useState<VaultNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const loadTree = useCallback(async () => {
    try {
      const res = await vaultApi.tree()
      setTree(res.data)
    } catch {
      setTree(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTree() }, [loadTree])

  const handleSync = async () => {
    setSyncing(true)
    await vaultApi.sync()
    setSyncing(false)
    loadTree()
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>📂 Vault</span>
        <button style={styles.syncBtn} onClick={handleSync} disabled={syncing}>
          {syncing ? '同期中...' : '↻ 同期'}
        </button>
        <button style={styles.closeBtn} onClick={onClose}>×</button>
      </div>
      <div style={styles.tree}>
        {loading && <div style={styles.loading}>読み込み中...</div>}
        {!loading && !tree && <div style={styles.loading}>Vault が設定されていません</div>}
        {tree && <TreeNode node={tree} onPreview={setPreviewPath} />}
      </div>
      {previewPath && (
        <ObsidianPreview path={previewPath} onClose={() => setPreviewPath(null)} />
      )}
    </div>
  )
}

function TreeNode({ node, depth = 0, onPreview }: { node: VaultNode; depth?: number; onPreview: (path: string) => void }) {
  const [open, setOpen] = useState(depth === 0)
  const [hovering, setHovering] = useState(false)

  const isFile = node.type === 'file'
  const isMarkdown = isFile && node.name.endsWith('.md')
  const indent = depth * 14

  const handleClick = () => {
    if (isFile) {
      if (isMarkdown) {
        // open in Obsidian
        const uri = `obsidian://open?file=${encodeURIComponent(node.path)}`
        window.location.href = uri
      }
    } else {
      setOpen(!open)
    }
  }

  return (
    <div>
      <div
        style={{
          paddingLeft: `${indent + 8}px`,
          paddingRight: '8px',
          paddingTop: '3px',
          paddingBottom: '3px',
          cursor: 'pointer',
          background: hovering ? '#f0f0f0' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '13px',
          position: 'relative',
        }}
        onClick={handleClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {!isFile && (
          <span style={{ fontSize: '10px', color: '#888', width: '10px' }}>
            {open ? '▼' : '▶'}
          </span>
        )}
        {isFile && <span style={{ width: '10px' }} />}
        <span>{isFile ? (isMarkdown ? '📄' : '📎') : '📁'}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
        {isMarkdown && hovering && (
          <button
            style={styles.previewBtn}
            onClick={(e) => { e.stopPropagation(); onPreview(node.path) }}
          >
            👁
          </button>
        )}
      </div>
      {!isFile && open && node.children?.map((child) => (
        <TreeNode key={child.path} node={child} depth={depth + 1} onPreview={onPreview} />
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: { width: '240px', borderRight: '1px solid #e0e0e0', background: '#fff', display: 'flex', flexDirection: 'column', height: '100%' },
  header: { padding: '8px 10px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '6px' },
  title: { flex: 1, fontWeight: 600, fontSize: '13px' },
  syncBtn: { padding: '2px 8px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', background: '#f5f5f5' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#666', padding: 0 },
  tree: { flex: 1, overflowY: 'auto', paddingTop: '4px' },
  loading: { padding: '16px', color: '#888', fontSize: '13px' },
  previewBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '1px 4px', borderRadius: '3px', color: '#1565c0' },
}
