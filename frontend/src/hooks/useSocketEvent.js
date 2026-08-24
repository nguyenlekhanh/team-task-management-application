import { useEffect } from 'react'
import { useSocket } from '../contexts/SocketContext'

// Subscribes to a socket event for the component lifetime; removes the
// listener on unmount or when the socket/connection changes.
export function useSocketEvent(eventName, handler) {
  const socket = useSocket()

  useEffect(() => {
    if (!socket) return undefined
    socket.on(eventName, handler)
    return () => {
      socket.off(eventName, handler)
    }
  }, [socket, eventName, handler])
}
