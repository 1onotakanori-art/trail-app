import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('trail_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('trail_token')
      localStorage.removeItem('trail_user')
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

export default api

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
}

export const usersApi = {
  list: () => api.get('/users'),
  create: (data: { username: string; password: string; display_name: string; role: string }) =>
    api.post('/users', data),
  update: (id: string, data: { display_name?: string; role?: string }) =>
    api.patch(`/users/${id}`, data),
  resetPassword: (id: string, new_password: string) =>
    api.post(`/users/${id}/reset-password`, { new_password }),
  updateSettings: (id: string, dashboard_widgets: unknown[]) =>
    api.patch(`/users/${id}/settings`, { dashboard_widgets }),
}

export const channelsApi = {
  list: (params?: { sort?: string; bookmarked_only?: boolean }) =>
    api.get('/channels', { params }),
  subscribe: (id: string) => api.post(`/channels/${id}/subscribe`),
  unsubscribe: (id: string) => api.delete(`/channels/${id}/subscribe`),
  bookmark: (id: string, bookmarked: boolean) =>
    api.patch(`/channels/${id}/bookmark`, { bookmarked }),
}

export const messagesApi = {
  list: (channelId: string, params?: { limit?: number; before?: string }) =>
    api.get(`/channels/${channelId}/messages`, { params }),
  post: (channelId: string, data: { content: string; tag?: string; mentions?: string[]; obsidian_links?: unknown[] }) =>
    api.post(`/channels/${channelId}/messages`, data),
  react: (messageId: string, emoji: string) =>
    api.post(`/messages/${messageId}/reactions`, { emoji }),
}

export const notificationsApi = {
  list: () => api.get('/notifications'),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  readAll: () => api.post('/notifications/read-all'),
}

export const projectsApi = {
  list: (params?: { state?: string; owner_id?: string; archived?: boolean }) =>
    api.get('/projects', { params }),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: {
    name: string; owner_id: string; start_date: string; end_date: string;
    tags?: string[]; box_url?: string; box_local_path?: string; feeling?: string
  }) => api.post('/projects', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/projects/${id}`, data),
  close: (id: string, data: { close_summary: string; close_outputs?: unknown[] }) =>
    api.post(`/projects/${id}/close`, data),
}

export const tasksApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/tasks`),
  create: (projectId: string, data: { title: string; planned_start: string; planned_end: string; sort_order?: number }) =>
    api.post(`/projects/${projectId}/tasks`, data),
  update: (taskId: string, data: Record<string, unknown>) => api.patch(`/tasks/${taskId}`, data),
  delete: (taskId: string) => api.delete(`/tasks/${taskId}`),
  reorder: (projectId: string, task_ids: string[]) =>
    api.patch(`/projects/${projectId}/tasks/reorder`, { task_ids }),
  getProgress: (taskId: string) => api.get(`/tasks/${taskId}/progress`),
  setProgress: (taskId: string, date: string, progress: number) =>
    api.put(`/tasks/${taskId}/progress/${date}`, { progress }),
}

export const dependenciesApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/dependencies`),
  create: (data: { predecessor_id: string; successor_id: string; dep_type?: string }) =>
    api.post('/dependencies', data),
  delete: (depId: string) => api.delete(`/dependencies/${depId}`),
}

export const milestonesApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/milestones`),
  create: (projectId: string, data: { title: string; date: string; description?: string }) =>
    api.post(`/projects/${projectId}/milestones`, data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/milestones/${id}`, data),
  delete: (id: string) => api.delete(`/milestones/${id}`),
}

export const ganttApi = {
  getAll: (params?: { owner_id?: string; tag?: string; date_from?: string; date_to?: string }) =>
    api.get('/gantt', { params }),
  getDaily: (projectId: string, date: string) => api.get(`/gantt/daily/${projectId}/${date}`),
}

export const dailyLogsApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/daily-logs`),
  create: (projectId: string, data: { date: string; comment?: string; obsidian_note_path?: string }) =>
    api.post(`/projects/${projectId}/daily-logs`, data),
  update: (id: string, comment: string) => api.patch(`/daily-logs/${id}`, { comment }),
  listWeekly: (projectId: string) => api.get(`/projects/${projectId}/weekly-summaries`),
  upsertWeekly: (projectId: string, week_start: string, data: { content: string; source?: string }) =>
    api.put(`/projects/${projectId}/weekly-summaries/${week_start}`, data),
}

export const vaultApi = {
  sync: () => api.post('/vault/sync'),
  status: () => api.get('/vault/status'),
  tree: () => api.get('/vault/tree'),
  preview: (notePath: string) => api.get(`/vault/preview/${notePath}`, { responseType: 'text' }),
}

export const searchApi = {
  search: (q: string) => api.get('/search', { params: { q } }),
}

export const dashboardApi = {
  get: () => api.get('/dashboard'),
  alerts: () => api.get('/dashboard/alerts'),
}
