export interface User {
  id: string
  username: string
  display_name: string
  role: 'admin' | 'member'
  created_at?: string
}

export interface AuthState {
  user: User | null
  token: string | null
}

export type TabId = 'main' | 'chat' | 'projects' | 'dashboard'
