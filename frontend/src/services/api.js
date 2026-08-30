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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const isAuthEndpoint = AUTH_ENDPOINTS.some((p) => url.includes(p))
    if (error.response?.status === 401 && !isAuthEndpoint) {
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
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
}

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