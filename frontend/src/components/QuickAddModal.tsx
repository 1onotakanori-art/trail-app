import React, { useState } from 'react'
import { User } from '../types'
import { projectsApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  users: User[]
  onClose: () => void
  onCreated: () => void
}

export default function QuickAddModal({ users, onClose, onCreated }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    name: '',
    owner_id: user?.id || '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    feeling: '順調',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.end_date) { setError('業務名と終了日は必須です'); return }
    setLoading(true)
    try {
      await projectsApi.create({
        name: form.name.trim(),
        owner_id: form.owner_id,
        start_date: form.start_date,
        end_date: form.end_date,
        feeling: form.feeling,
      })
      onCreated()
    } catch {
      setError('登録に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={styles.title}>新規業務登録</h3>
          <button onClick={onClose} style={styles.closeBtn}>×</button>
        </div>
        <form onSubmit={submit} style={styles.form}>
          <label style={styles.label}>業務名 *</label>
          <input style={styles.input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例: バッテリーCAE解析" required autoFocus />

          <label style={styles.label}>担当者 *</label>
          <select style={styles.input} value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
            {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
          </select>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>開始日 *</label>
              <input type="date" style={styles.input} value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>終了日（納期）*</label>
              <input type="date" style={styles.input} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} required />
            </div>
          </div>

          <label style={styles.label}>Feeling</label>
          <select style={styles.input} value={form.feeling} onChange={(e) => set('feeling', e.target.value)}>
            <option value="順調">✓ 順調</option>
            <option value="やや不安">△ やや不安</option>
            <option value="遅延しそう">⚠ 遅延しそう</option>
            <option value="相談したい">💬 相談したい</option>
          </select>

          {error && <p style={{ color: '#d32f2f', fontSize: '13px', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>キャンセル</button>
            <button type="submit" style={styles.submitBtn} disabled={loading}>
              {loading ? '登録中...' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 800 },
  modal: { background: '#fff', borderRadius: '10px', padding: '24px', width: '480px', maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  header: { display: 'flex', alignItems: 'center', marginBottom: '16px' },
  title: { margin: 0, fontSize: '16px', fontWeight: 700, color: '#1a237e', flex: 1 },
  closeBtn: { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666', padding: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#444' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
  cancelBtn: { padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', background: '#fff' },
  submitBtn: { padding: '8px 24px', background: '#1a237e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 },
}
