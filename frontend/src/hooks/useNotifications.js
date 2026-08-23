import { useState, useEffect, useCallback, useRef } from 'react'
import { notificationApi } from '../services/api'

const POLL_INTERVAL_MS = 30000

export function useNotifications(isAuthenticated) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pagination, setPagination] = useState({ page: 1, hasMore: false, total: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await notificationApi.unreadCount()
      setUnreadCount(response.data.unreadCount || 0)
    } catch {
      // silent - badge refresh is non-critical
    }
  }, [])

  const fetchNotifications = useCallback(async ({ silent } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const response = await notificationApi.list({ page: 1, limit: 20 })
      setNotifications(response.data.items || [])
      setPagination({
        page: response.data.pagination?.page || 1,
        hasMore: response.data.pagination?.hasMore || false,
        total: response.data.pagination?.total || 0
      })
    } catch {
      setError('Failed to load notifications')
    } finally {
      setLoading(false)
      fetchUnreadCount()
    }
  }, [fetchUnreadCount])

  const loadMore = useCallback(async () => {
    try {
      const nextPage = pagination.page + 1
      const response = await notificationApi.list({ page: nextPage, limit: 20 })
      setNotifications(prev => [...prev, ...(response.data.items || [])])
      setPagination(prev => ({
        ...prev,
        page: response.data.pagination?.page || prev.page + 1,
        hasMore: response.data.pagination?.hasMore || false
      }))
    } catch {
      setError('Failed to load more notifications')
    }
  }, [pagination.page])

  const markAsRead = useCallback(async (id) => {
    try {
      await notificationApi.markAsRead(id)
      setNotifications(prev => prev.map(n => (
        n.id === id && !n.isRead
          ? { ...n, isRead: true, readAt: new Date().toISOString() }
          : n
      )))
      setUnreadCount(count => Math.max(0, count - 1))
    } catch {
      setError('Failed to mark notification as read')
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationApi.markAllAsRead()
      setNotifications(prev => prev.map(n => ({
        ...n,
        isRead: true,
        readAt: n.readAt || new Date().toISOString()
      })))
      setUnreadCount(0)
    } catch {
      setError('Failed to mark all notifications as read')
    }
  }, [])

  const deleteNotification = useCallback(async (id) => {
    try {
      const wasUnread = notifications.find(n => n.id === id)?.isRead === false
      await notificationApi.delete(id)
      setNotifications(prev => prev.filter(n => n.id !== id))
      setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }))
      if (wasUnread) {
        setUnreadCount(count => Math.max(0, count - 1))
      }
    } catch {
      setError('Failed to delete notification')
    }
  }, [notifications])

  useEffect(() => {
    if (!isAuthenticated) return undefined

    fetchUnreadCount()
    pollRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL_MS)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [isAuthenticated, fetchUnreadCount])

  return {
    notifications,
    unreadCount,
    pagination,
    loading,
    error,
    fetchNotifications,
    refreshUnreadCount: fetchUnreadCount,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification
  }
}
