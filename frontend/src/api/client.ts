import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const api = axios.create({ baseURL: '/api' })

// 5-1: Track refresh state to avoid concurrent refresh calls
let isRefreshing = false
let failedQueue: { resolve: (token: string) => void; reject: (err: unknown) => void }[] = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error)
    else prom.resolve(token!)
  })
  failedQueue = []
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('trail_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const originalRequest = err.config as InternalAxiosRequestConfig & { _retry?: boolean }
    // 5-1: JWT refresh flow — intercept 401 and attempt token refresh
    if (err.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('trail_refresh_token')
      if (!refreshToken) {
        // No refresh token available — force logout
        localStorage.removeItem('trail_token')
        localStorage.removeItem('trail_user')
        localStorage.removeItem('trail_refresh_token')
        window.location.reload()
        return Promise.reject(err)
      }

      if (isRefreshing) {
        // Another refresh is in progress — queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(api(originalRequest))
            },
            reject,
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken })
        const { access_token, refresh_token: newRefresh } = res.data
        localStorage.setItem('trail_token', access_token)
        if (newRefresh) localStorage.setItem('trail_refresh_token', newRefresh)
        api.defaults.headers.common.Authorization = `Bearer ${access_token}`
        processQueue(null, access_token)
        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return api(originalRequest)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        localStorage.removeItem('trail_token')
        localStorage.removeItem('trail_user')
        localStorage.removeItem('trail_refresh_token')
        window.location.reload()
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export default api

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  refresh: (refresh_token: string) =>
    api.post('/auth/refresh', { refresh_token }),
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
  // 5-5: Profile update and password change
  updateProfile: (id: string, data: { display_name: string }) =>
    api.put(`/users/${id}/profile`, data),
  changePassword: (id: string, data: { current_password: string; new_password: string }) =>
    api.post(`/users/${id}/change-password`, data),
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
  // 5-4: LLM generate endpoint
  generateWeekly: (projectId: string, week_start: string) =>
    api.post(`/projects/${projectId}/weekly-summaries/${week_start}/generate`),
  generateLogSummary: (logId: string) =>
    api.post(`/daily-logs/${logId}/llm-summary`),
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

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: { lm_studio_url?: string; lm_studio_model?: string }) =>
    api.patch('/settings', data),
  checkLlm: () => api.get('/settings/llm-check'),
}
