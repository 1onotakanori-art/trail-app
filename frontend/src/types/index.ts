export interface User {
  id: string
  username: string
  display_name: string
  role: 'admin' | 'member'
  created_at?: string
}

export type TabId = 'main' | 'chat' | 'projects' | 'dashboard'

// Chat
export interface Channel {
  id: string
  project_id: string | null
  name: string
  type: 'project' | 'general' | 'dm'
  bookmarked: boolean | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number
  created_at: string
}

export interface Message {
  id: string
  channel_id: string
  user_id: string
  display_name: string
  username?: string
  content: string
  tag: '報告' | '連絡' | '相談' | null
  mentions: string[]
  reactions: Record<string, string[]>
  obsidian_links: ObsidianLink[]
  created_at: string
}

export interface ObsidianLink {
  path: string
  uri: string
  label?: string
}

export interface Notification {
  id: string
  type: 'mention' | 'message' | 'follow_alert' | 'project_created'
  title: string
  body: string
  link_type: 'channel' | 'project' | null
  link_id: string | null
  read: boolean
  created_at: string
}

// Projects
export interface Project {
  id: string
  name: string
  owner_id: string
  owner_name: string
  state: '進行中' | '待機中' | '完了'
  feeling: '順調' | 'やや不安' | '遅延しそう' | '相談したい'
  feeling_updated_at: string | null
  start_date: string
  end_date: string
  tags: string[]
  box_url: string | null
  box_local_path: string | null
  obsidian_folder: string | null
  archived: boolean
  close_summary: string | null
  close_outputs: CloseOutput[]
  closed_at: string | null
  created_at: string
}

export interface CloseOutput {
  label: string
  url?: string
}

export interface Task {
  id: string
  project_id: string
  title: string
  planned_start: string
  planned_end: string
  actual_start: string | null
  actual_end: string | null
  status: '未着手' | '進行中' | '完了'
  sort_order: number
  created_at: string
  daily_progress?: Record<string, number>
}

export interface Dependency {
  id: string
  predecessor_id: string
  successor_id: string
  dep_type: string
}

export interface Milestone {
  id: string
  project_id: string
  title: string
  date: string
  description: string | null
}

export interface DailyLog {
  id: string
  project_id: string
  task_id: string | null
  date: string
  comment: string | null
  obsidian_note_path: string | null
  obsidian_uri: string | null
  source: string
  created_at: string
}

export interface WeeklySummary {
  id: string
  project_id: string
  week_start: string
  content: string
  source: string
  updated_at: string
}

// Gantt
export interface GanttProject extends Project {
  tasks: Task[]
  milestones: Milestone[]
  dependencies: Dependency[]
  daily_logs: DailyLog[]
}

// Vault
export interface VaultNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: VaultNode[]
}
