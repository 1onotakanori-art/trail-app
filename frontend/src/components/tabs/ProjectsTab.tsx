import React, { useState, useEffect, useCallback } from 'react'
import { Project, User, Task, Dependency } from '../../types'
import { projectsApi, usersApi, tasksApi, dependenciesApi } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { User as UserIcon, Calendar, Package, FileText, Plus, AlertTriangle } from 'lucide-react'
import { StateIcon, FeelingIcon } from '../Icons'

const FEELING_COLORS: Record<string, string> = { '順調': '#2e7d32', 'やや不安': '#f57f17', '遅延しそう': '#c62828', '相談したい': '#6a1b9a' }

type DisplayMode = 'active' | 'archived' | 'all'

export default function ProjectsTab() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [displayMode, setDisplayMode] = useState<DisplayMode>('active')
  const [filterOwner, setFilterOwner] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [taskProject, setTaskProject] = useState<Project | null>(null)
  const [closeProject, setCloseProject] = useState<Project | null>(null)

  const load = useCallback(async () => {
    try { // 4-2: try-catch
      const params: Record<string, unknown> = {}
      if (displayMode === 'active') params.archived = false
      else if (displayMode === 'archived') params.archived = true
      if (filterOwner) params.owner_id = filterOwner
      const res = await projectsApi.list(params as Record<string, boolean | string>)
      let data: Project[] = res.data
      if (filterTag) data = data.filter((p) => p.tags.includes(filterTag))
      setProjects(data)
    } catch (err) {
      console.error('Failed to load projects:', err)
    }
  }, [displayMode, filterOwner, filterTag])

  useEffect(() => { load() }, [load])
  useEffect(() => { usersApi.list().then((r) => setUsers(r.data)) }, [])

  const allTags = [...new Set(projects.flatMap((p) => p.tags))].sort()

  return (
    <div style={s.container}>
      {/* toolbar */}
      <div style={s.toolbar}>
        <button style={s.newBtn} onClick={() => setShowNewForm(true)}><span style={{display:'inline-flex',alignItems:'center',gap:4}}><Plus size={14}/>新規登録</span></button>
        <div style={s.modeGroup}>
          {(['active', 'archived', 'all'] as DisplayMode[]).map((m) => (
            <button key={m} onClick={() => setDisplayMode(m)}
              style={{ ...s.modeBtn, ...(displayMode === m ? s.modeBtnActive : {}) }}>
              {m === 'active' ? 'アクティブ' : m === 'archived' ? '完了・アーカイブ' : '全て'}
            </button>
          ))}
        </div>
        <select style={s.filter} value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)}>
          <option value="">担当者: 全員</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
        </select>
        <select style={s.filter} value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
          <option value="">タグ: 全て</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* card list */}
      <div style={s.cardList}>
        {projects.length === 0 && (
          <div style={s.empty}>プロジェクトがありません</div>
        )}
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onEdit={() => setEditProject(p)}
            onTasks={() => setTaskProject(p)}
            onClose={() => setCloseProject(p)}
            onRefresh={load}
          />
        ))}
      </div>

      {/* Modals */}
      {showNewForm && (
        <ProjectFormModal
          users={users}
          currentUser={user}
          onClose={() => setShowNewForm(false)}
          onSaved={() => { setShowNewForm(false); load() }}
        />
      )}
      {editProject && (
        <ProjectFormModal
          project={editProject}
          users={users}
          currentUser={user}
          onClose={() => setEditProject(null)}
          onSaved={() => { setEditProject(null); load() }}
        />
      )}
      {taskProject && (
        <TaskManagementModal
          project={taskProject}
          onClose={() => setTaskProject(null)}
        />
      )}
      {closeProject && (
        <CloseModal
          project={closeProject}
          onClose={() => setCloseProject(null)}
          onClosed={() => { setCloseProject(null); load() }}
        />
      )}
    </div>
  )
}

// ── Project Card ────────────────────────────────────────────────────────

function ProjectCard({ project: p, onEdit, onTasks, onClose }: {
  project: Project
  onEdit: () => void
  onTasks: () => void
  onClose: () => void
  onRefresh?: () => void
}) {
  const obsidianUri = p.obsidian_folder
    ? `obsidian://open?vault=TeamVault&file=${encodeURIComponent(p.obsidian_folder + '/★' + p.name + '.md')}`
    : null

  const fmt = (d: string) => { const [, m, day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}` }

  return (
    <div style={s.card}>
      <div style={s.cardTop}>
        <div style={s.cardId}>{p.id}</div>
        <div style={{ flex: 1 }}>
          <span style={s.cardName}>{p.name}</span>
          {p.archived && <span style={s.archivedBadge}>アーカイブ</span>}
        </div>
      </div>
      <div style={s.cardMeta}>
        <span style={{display:'inline-flex',alignItems:'center',gap:4}}><UserIcon size={13}/>{p.owner_name}</span>
        <span style={{display:'inline-flex',alignItems:'center',gap:4}}><Calendar size={13}/>{fmt(p.start_date)} 〜 {fmt(p.end_date)}</span>
        <span style={{display:'inline-flex',alignItems:'center',gap:4}}><StateIcon state={p.state} size={12}/>{p.state}</span>
        <span style={{ color: FEELING_COLORS[p.feeling] || '#333', display:'inline-flex', alignItems:'center', gap:4 }}>
          <FeelingIcon feeling={p.feeling} size={12}/>{p.feeling}
        </span>
      </div>
      {p.tags.length > 0 && (
        <div style={s.cardTags}>
          {p.tags.map((t) => <span key={t} style={s.tag}>{t}</span>)}
        </div>
      )}
      <div style={s.cardLinks}>
        {p.box_url && <a href={p.box_url} target="_blank" rel="noreferrer" style={{...s.link,display:'inline-flex',alignItems:'center',gap:4}}><Package size={13}/>Box</a>}
        {obsidianUri && <a href={obsidianUri} style={{...s.link,display:'inline-flex',alignItems:'center',gap:4}}><FileText size={13}/>Obsidian</a>}
      </div>
      <div style={s.cardActions}>
        {!p.archived && (
          <>
            <button style={s.actionBtn} onClick={onEdit}>編集</button>
            <button style={s.actionBtn} onClick={onTasks}>子タスク管理</button>
            <button style={{ ...s.actionBtn, color: '#c62828' }} onClick={onClose}>クローズ</button>
          </>
        )}
        {p.archived && p.close_summary && (
          <div style={s.closeSummary}>
            <strong>最終サマリー:</strong> {p.close_summary}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Project Form Modal ──────────────────────────────────────────────────

interface ProjectFormProps {
  project?: Project
  users: User[]
  currentUser: { id: string } | null
  onClose: () => void
  onSaved: () => void
}

function ProjectFormModal({ project, users, currentUser, onClose, onSaved }: ProjectFormProps) {
  const isEdit = !!project
  const [form, setForm] = useState({
    name: project?.name || '',
    owner_id: project?.owner_id || currentUser?.id || '',
    start_date: project?.start_date || new Date().toISOString().slice(0, 10),
    end_date: project?.end_date || '',
    state: project?.state || '進行中',
    feeling: project?.feeling || '順調',
    tags: project?.tags.join(', ') || '',
    box_url: project?.box_url || '',
    box_local_path: project?.box_local_path || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.end_date) { setError('業務名と終了日は必須です'); return }
    setLoading(true)
    try {
      const tagsArr = form.tags.split(/[,、]/).map((t) => t.trim()).filter(Boolean)
      if (isEdit && project) {
        await projectsApi.update(project.id, {
          name: form.name.trim(),
          owner_id: form.owner_id,
          start_date: form.start_date,
          end_date: form.end_date,
          state: form.state,
          feeling: form.feeling,
          tags: tagsArr,
          box_url: form.box_url || null,
          box_local_path: form.box_local_path || null,
        })
      } else {
        await projectsApi.create({
          name: form.name.trim(),
          owner_id: form.owner_id,
          start_date: form.start_date,
          end_date: form.end_date,
          feeling: form.feeling,
          tags: tagsArr,
          box_url: form.box_url || undefined,
          box_local_path: form.box_local_path || undefined,
        })
      }
      onSaved()
    } catch {
      setError('保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={modal.box}>
        <ModalHeader title={isEdit ? '業務編集' : '業務新規登録'} onClose={onClose} />
        <form onSubmit={submit} style={modal.form}>
          <FormField label="業務名 *">
            <input style={modal.input} value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
          </FormField>
          <FormField label="担当者 *">
            <select style={modal.input} value={form.owner_id} onChange={(e) => set('owner_id', e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}
            </select>
          </FormField>
          <div style={{ display: 'flex', gap: '12px' }}>
            <FormField label="開始日 *" style={{ flex: 1 }}>
              <input type="date" style={modal.input} value={form.start_date} onChange={(e) => set('start_date', e.target.value)} required />
            </FormField>
            <FormField label="終了日（納期）*" style={{ flex: 1 }}>
              <input type="date" style={modal.input} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} required />
            </FormField>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <FormField label="State" style={{ flex: 1 }}>
              <select style={modal.input} value={form.state} onChange={(e) => set('state', e.target.value)}>
                <option value="進行中">進行中</option>
                <option value="待機中">待機中</option>
                <option value="完了">完了</option>
              </select>
            </FormField>
            <FormField label="Feeling" style={{ flex: 1 }}>
              <select style={modal.input} value={form.feeling} onChange={(e) => set('feeling', e.target.value)}>
                <option value="順調">順調</option>
                <option value="やや不安">やや不安</option>
                <option value="遅延しそう">遅延しそう</option>
                <option value="相談したい">相談したい</option>
              </select>
            </FormField>
          </div>
          <FormField label="タグ（カンマ区切り）">
            <input style={modal.input} value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="CAE, 電池, 設計" />
          </FormField>
          <FormField label="Box URL">
            <input style={modal.input} value={form.box_url} onChange={(e) => set('box_url', e.target.value)} placeholder="https://..." />
          </FormField>
          <FormField label="BoxDrive ローカルパス">
            <input style={modal.input} value={form.box_local_path} onChange={(e) => set('box_local_path', e.target.value)} placeholder="C:\Box\..." />
          </FormField>
          {error && <p style={modal.error}>{error}</p>}
          <div style={modal.footer}>
            <button type="button" onClick={onClose} style={modal.cancelBtn}>キャンセル</button>
            <button type="submit" style={modal.submitBtn} disabled={loading}>
              {loading ? '保存中...' : isEdit ? '更新' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </Overlay>
  )
}

// ── Task Management Modal ───────────────────────────────────────────────

function TaskManagementModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [deps, setDeps] = useState<Dependency[]>([])
  const [newTask, setNewTask] = useState({ title: '', planned_start: project.start_date, planned_end: project.end_date })
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const [tr, dr] = await Promise.all([
      tasksApi.list(project.id),
      dependenciesApi.list(project.id),
    ])
    setTasks(tr.data)
    setDeps(dr.data)
  }, [project.id])

  useEffect(() => { load() }, [load])

  const addTask = async () => {
    if (!newTask.title.trim()) return
    setLoading(true)
    await tasksApi.create(project.id, {
      title: newTask.title.trim(),
      planned_start: newTask.planned_start,
      planned_end: newTask.planned_end,
      sort_order: tasks.length,
    })
    setNewTask({ title: '', planned_start: project.start_date, planned_end: project.end_date })
    await load()
    setLoading(false)
  }

  const deleteTask = async (taskId: string) => {
    await tasksApi.delete(taskId)
    load()
  }

  const saveEdit = async () => {
    if (!editTask) return
    await tasksApi.update(editTask.id, {
      title: editTask.title,
      planned_start: editTask.planned_start,
      planned_end: editTask.planned_end,
      status: editTask.status,
    })
    setEditTask(null)
    load()
  }

  const deleteDep = async (depId: string) => {
    await dependenciesApi.delete(depId)
    load()
  }

  const taskMap = Object.fromEntries(tasks.map((t) => [t.id, t]))
  const STATUS_COLORS: Record<string, string> = { '未着手': '#888', '進行中': '#1565c0', '完了': '#2e7d32' }

  return (
    <Overlay onClose={onClose}>
      <div style={{ ...modal.box, width: '680px', maxWidth: '95vw' }}>
        <ModalHeader title={`子タスク管理 — ${project.name}`} onClose={onClose} />
        <div style={{ padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* add task */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <label style={modal.label}>タスク名</label>
              <input style={modal.input} value={newTask.title} onChange={(e) => setNewTask((f) => ({ ...f, title: e.target.value }))}
                placeholder="例: メッシュ作成" onKeyDown={(e) => { if (e.key === 'Enter') addTask() }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={modal.label}>開始日</label>
              <input type="date" style={modal.input} value={newTask.planned_start} onChange={(e) => setNewTask((f) => ({ ...f, planned_start: e.target.value }))} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={modal.label}>終了日</label>
              <input type="date" style={modal.input} value={newTask.planned_end} onChange={(e) => setNewTask((f) => ({ ...f, planned_end: e.target.value }))} />
            </div>
            <button onClick={addTask} disabled={loading} style={{ ...modal.submitBtn, alignSelf: 'flex-end', padding: '8px 14px' }}><span style={{display:'inline-flex',alignItems:'center',gap:4}}><Plus size={13}/>追加</span></button>
          </div>

          {/* task list */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                {['タスク名', '計画開始', '計画終了', 'ステータス', ''].map((h) => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: '1px solid #e0e0e0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  {editTask?.id === t.id ? (
                    <>
                      <td style={{ padding: '4px 6px' }}>
                        <input style={{ ...modal.input, padding: '4px 6px' }} value={editTask.title} onChange={(e) => setEditTask({ ...editTask, title: e.target.value })} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input type="date" style={{ ...modal.input, padding: '4px 6px' }} value={editTask.planned_start} onChange={(e) => setEditTask({ ...editTask, planned_start: e.target.value })} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input type="date" style={{ ...modal.input, padding: '4px 6px' }} value={editTask.planned_end} onChange={(e) => setEditTask({ ...editTask, planned_end: e.target.value })} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select style={{ ...modal.input, padding: '4px 6px' }} value={editTask.status} onChange={(e) => setEditTask({ ...editTask, status: e.target.value as Task['status'] })}>
                          <option value="未着手">未着手</option>
                          <option value="進行中">進行中</option>
                          <option value="完了">完了</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px', display: 'flex', gap: '4px' }}>
                        <button onClick={saveEdit} style={smBtn}>保存</button>
                        <button onClick={() => setEditTask(null)} style={smBtn}>×</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '6px 8px' }}>{t.title}</td>
                      <td style={{ padding: '6px 8px', color: '#666' }}>{t.planned_start}</td>
                      <td style={{ padding: '6px 8px', color: '#666' }}>{t.planned_end}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ color: STATUS_COLORS[t.status], fontWeight: 600 }}>{t.status}</span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => setEditTask(t)} style={smBtn}>編集</button>
                          <button onClick={() => deleteTask(t.id)} style={{ ...smBtn, color: '#c62828' }}>削除</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '16px', color: '#aaa', textAlign: 'center' }}>タスクがありません</td></tr>
              )}
            </tbody>
          </table>

          {/* dependencies */}
          {deps.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#555', marginBottom: '8px' }}>依存関係</div>
              {deps.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '13px' }}>
                  <span>{taskMap[d.predecessor_id]?.title || d.predecessor_id}</span>
                  <span style={{ color: '#1565c0' }}>→</span>
                  <span>{taskMap[d.successor_id]?.title || d.successor_id}</span>
                  <button onClick={() => deleteDep(d.id)} style={{ ...smBtn, marginLeft: 'auto', color: '#c62828' }}>削除</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Overlay>
  )
}

// ── Close Modal ─────────────────────────────────────────────────────────

function CloseModal({ project, onClose, onClosed }: { project: Project; onClose: () => void; onClosed: () => void }) {
  const [summary, setSummary] = useState('')
  const [outputs, setOutputs] = useState<{ label: string; url: string }[]>([{ label: '', url: '' }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addOutput = () => setOutputs((prev) => [...prev, { label: '', url: '' }])
  const removeOutput = (i: number) => setOutputs((prev) => prev.filter((_, idx) => idx !== i))
  const setOutput = (i: number, key: 'label' | 'url', val: string) =>
    setOutputs((prev) => prev.map((o, idx) => idx === i ? { ...o, [key]: val } : o))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!summary.trim()) { setError('最終サマリーを入力してください'); return }
    setLoading(true)
    try {
      await projectsApi.close(project.id, {
        close_summary: summary.trim(),
        close_outputs: outputs.filter((o) => o.label || o.url),
      })
      onClosed()
    } catch {
      setError('クローズに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ ...modal.box, width: '520px', maxWidth: '95vw' }}>
        <ModalHeader title={`業務クローズ — ${project.name}`} onClose={onClose} />
        <form onSubmit={submit} style={modal.form}>
          <FormField label="最終サマリー *">
            <textarea style={{ ...modal.input, minHeight: '100px', resize: 'vertical' }}
              value={summary} onChange={(e) => setSummary(e.target.value)}
              placeholder="業務の最終サマリーを入力してください" autoFocus />
          </FormField>
          <div>
            <label style={modal.label}>最終アウトプット</label>
            {outputs.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <input style={{ ...modal.input, flex: 1 }} value={o.label} onChange={(e) => setOutput(i, 'label', e.target.value)} placeholder="ラベル（例: 解析報告書）" />
                <input style={{ ...modal.input, flex: 2 }} value={o.url} onChange={(e) => setOutput(i, 'url', e.target.value)} placeholder="URL or パス" />
                <button type="button" onClick={() => removeOutput(i)} style={{ ...smBtn, color: '#c62828', padding: '0 8px' }}>×</button>
              </div>
            ))}
            <button type="button" onClick={addOutput} style={{ ...smBtn, marginTop: '4px' }}><span style={{display:'inline-flex',alignItems:'center',gap:4}}><Plus size={13}/>追加</span></button>
          </div>
          {error && <p style={modal.error}>{error}</p>}
          <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: '6px', padding: '10px 12px', fontSize: '13px', color: '#e65100' }}>
            <span style={{display:'inline-flex',alignItems:'center',gap:4}}><AlertTriangle size={13}/>クローズすると archived = true になり、アクティブ一覧から除外されます。</span>
          </div>
          <div style={modal.footer}>
            <button type="button" onClick={onClose} style={modal.cancelBtn}>キャンセル</button>
            <button type="submit" style={{ ...modal.submitBtn, background: '#c62828' }} disabled={loading}>
              {loading ? '処理中...' : 'クローズ'}
            </button>
          </div>
        </form>
      </div>
    </Overlay>
  )
}

// ── Shared UI helpers ───────────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 800 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      {children}
    </div>
  )
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center' }}>
      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1a237e', flex: 1 }}>{title}</h3>
      <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#666', lineHeight: 1 }}>×</button>
    </div>
  )
}

function FormField({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      <label style={modal.label}>{label}</label>
      {children}
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { padding: '16px 20px', height: 'calc(100vh - 92px)', overflowY: 'auto', background: '#f5f5f5' },
  toolbar: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' },
  newBtn: { padding: '7px 16px', background: '#1a237e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' },
  modeGroup: { display: 'flex', background: '#fff', border: '1px solid #ddd', borderRadius: '6px', overflow: 'hidden' },
  modeBtn: { padding: '6px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: '#666' },
  modeBtnActive: { background: '#1a237e', color: '#fff', fontWeight: 600 },
  filter: { padding: '6px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', background: '#fff' },
  cardList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  empty: { padding: '40px', textAlign: 'center', color: '#aaa', background: '#fff', borderRadius: '8px' },
  card: { background: '#fff', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  cardTop: { display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' },
  cardId: { fontSize: '11px', color: '#aaa', fontFamily: 'monospace', flexShrink: 0 },
  cardName: { fontSize: '16px', fontWeight: 700, color: '#1a237e' },
  archivedBadge: { marginLeft: '8px', background: '#e0e0e0', color: '#666', fontSize: '11px', padding: '2px 8px', borderRadius: '10px' },
  cardMeta: { display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '13px', color: '#555', marginBottom: '8px' },
  cardTags: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' },
  tag: { background: '#e8eaf6', color: '#3949ab', fontSize: '12px', padding: '2px 10px', borderRadius: '10px' },
  cardLinks: { display: 'flex', gap: '10px', marginBottom: '10px' },
  link: { fontSize: '13px', color: '#1565c0', textDecoration: 'none' },
  cardActions: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  actionBtn: { padding: '5px 14px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: '#fff' },
  closeSummary: { fontSize: '13px', color: '#555', background: '#f5f5f5', padding: '6px 10px', borderRadius: '4px', flex: 1 },
}

const modal: Record<string, React.CSSProperties> = {
  box: { background: '#fff', borderRadius: '10px', width: '560px', maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  form: { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' },
  label: { fontSize: '13px', fontWeight: 600, color: '#444' },
  input: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', width: '100%', boxSizing: 'border-box' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' },
  cancelBtn: { padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', background: '#fff' },
  submitBtn: { padding: '8px 24px', background: '#1a237e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 },
  error: { color: '#c62828', fontSize: '13px', margin: 0 },
}

const smBtn: React.CSSProperties = { padding: '4px 10px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', background: '#fff' }

