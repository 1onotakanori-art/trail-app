import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('trail_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('trail_token')
      localStorage.removeItem('trail_user')
      window.location.href = '/login'
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
