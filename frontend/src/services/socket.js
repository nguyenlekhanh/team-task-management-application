import { io } from 'socket.io-client'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

// Socket endpoint: explicit VITE_SOCKET_URL wins; otherwise derive the API
// origin from VITE_API_URL (e.g. http://localhost:3000/api -> http://localhost:3000).
// Empty result means same-origin (frontend co-hosted with backend).
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ||
  API_BASE_URL.replace(/\/api\/?$/, '') ||
  undefined

export function createSocket(token) {
  return io(SOCKET_URL, {
    auth: { token },
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000
  })
}
