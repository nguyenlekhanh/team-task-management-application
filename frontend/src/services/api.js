import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 15000,
})

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 401 handling: a session-expiry on a PROTECTED request clears stale auth and
// returns to /login. Auth-endpoint failures (e.g. wrong password on login)
// must NOT trigger the wipe/reload - the login page surfaces its own error.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register']

// Token refresh (9.1): when a protected request fails with 'Token expired',
// attempt ONE silent refresh and retry the original request. Single-flight:
// concurrent 401s share one refresh call. Refresh failure falls through to
// the existing wipe-and-redirect behavior. The refresh token itself is never
// persisted here — it lives in the httpOnly cookie; the body value from
// login/register/refresh is held in memory only for the explicit call below.
let refreshTokenPromise = null

async function performSilentRefresh() {
  if (!refreshTokenPromise) {
    refreshTokenPromise = api.post('/auth/refresh', {})
      .then((response) => {
        const { token } = response.data
        if (token) localStorage.setItem('token', token)
        return token
      })
      .catch((err) => {
        throw err
      })
      .finally(() => {
        refreshTokenPromise = null
      })
  }
  return refreshTokenPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url = error.config?.url || ''
    const isAuthEndpoint = AUTH_ENDPOINTS.some((p) => url.includes(p))
    const status = error.response?.status
    const message = error.response?.data?.error
    const isTokenExpired = status === 401 && message === 'Token expired'
    const isRefreshCall = url.includes('/auth/refresh')

    if (isTokenExpired && !isAuthEndpoint && !isRefreshCall && !error.config?._retried) {
      try {
        const newToken = await performSilentRefresh()
        if (newToken) {
          error.config._retried = true
          error.config.headers = error.config.headers || {}
          error.config.headers.Authorization = `Bearer ${newToken}`
          return api.request(error.config)
        }
      } catch {
        // refresh failed - fall through to the standard 401 wipe/redirect
      }
    }

    if (status === 401 && !isAuthEndpoint && !isRefreshCall) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Safe user-facing message extraction shared across pages/forms.
export function getApiErrorMessage(error, fallback) {
  if (error?.code === 'ECONNABORTED') return 'Request timed out. Please try again.'
  if (!error?.response) return 'Network error. Check your connection and try again.'
  return error.response?.data?.error || fallback
}

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: (data) => api.post('/auth/logout', data),
  refresh: () => api.post('/auth/refresh', {}),
  getMe: () => api.get('/auth/me'),
}

// Exported for SocketContext: single-flight silent refresh, returns the fresh
// access token or throws. Reuses the same interceptor machinery (9.1).
export { performSilentRefresh }

export const userApi = {
  getProfile: () => api.get('/users/me'),
  updateProfile: (data) => api.put('/users/me', data),
  changePassword: (data) => api.put('/users/me/password', data),
}

export const healthApi = {
  check: () => api.get('/health'),
}

export const groupApi = {
  list: (params) => api.get('/groups', { params }),
  create: (data) => api.post('/groups', data),
  get: (id) => api.get(`/groups/${id}`),
  update: (id, data) => api.put(`/groups/${id}`, data),
  delete: (id) => api.delete(`/groups/${id}`),
  getMembers: (id, params) => api.get(`/groups/${id}/members`, { params }),
  addMember: (id, data) => api.post(`/groups/${id}/members`, data),
  removeMember: (id, userId) => api.delete(`/groups/${id}/members/${userId}`),
  updateMemberRole: (id, userId, data) => api.put(`/groups/${id}/members/${userId}`, data),
}

export const taskApi = {
  list: (groupId, params) => api.get(`/groups/${groupId}/tasks`, { params }),
  getMyTasks: (params) => api.get('/tasks', { params }),
  create: (groupId, data) => api.post(`/groups/${groupId}/tasks`, data),
  get: (id) => api.get(`/tasks/${id}`),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
  assign: (id, data) => api.put(`/tasks/${id}/assign`, data),
  updateStatus: (id, data) => api.put(`/tasks/${id}/status`, data),
  getChecklist: (taskId) => api.get(`/tasks/${taskId}/checklist`),
  addChecklistItem: (taskId, data) => api.post(`/tasks/${taskId}/checklist`, data),
  updateChecklistItem: (taskId, itemId, data) => api.put(`/tasks/${taskId}/checklist/${itemId}`, data),
  deleteChecklistItem: (taskId, itemId) => api.delete(`/tasks/${taskId}/checklist/${itemId}`),
  toggleChecklistItem: (taskId, itemId, data) => api.put(`/tasks/${taskId}/checklist/${itemId}/toggle`, data),
}

export const messageApi = {
  getGroupMessages: (groupId, params) => api.get(`/groups/${groupId}/messages`, { params }),
  addGroupMessage: (groupId, data) => api.post(`/groups/${groupId}/messages`, data),
  getTaskComments: (taskId, params) => api.get(`/tasks/${taskId}/comments`, { params }),
  addTaskComment: (taskId, data) => api.post(`/tasks/${taskId}/comments`, data),
  updateMessage: (id, data) => api.put(`/messages/${id}`, data),
  deleteMessage: (id) => api.delete(`/messages/${id}`),
}

export const notificationApi = {
  list: (params) => api.get('/notifications', { params }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
  getPreferences: () => api.get('/notifications/preferences'),
  updatePreferences: (data) => api.put('/notifications/preferences', data),
}

export default api