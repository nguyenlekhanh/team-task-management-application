import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'
import { createSocket } from '../services/socket'

const SocketContext = createContext(null)

// Single socket connection per browser tab for authenticated users.
// Connects on login, disconnects on logout/expiry. Components subscribe via
// useSocketEvent - they never call io() directly (5D.1 §19).
export function SocketProvider({ children }) {
  const { isAuthenticated } = useAuth()
  const [socket, setSocket] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
        setSocket(null)
      }
      return undefined
    }

    const token = localStorage.getItem('token')
    if (!token) return undefined

    const s = createSocket(token)
    socketRef.current = s
    setSocket(s)

    return () => {
      s.close()
      if (socketRef.current === s) {
        socketRef.current = null
      }
    }
  }, [isAuthenticated])

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}
