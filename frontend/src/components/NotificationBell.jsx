import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import { NotificationDropdown } from './NotificationDropdown'

export function NotificationBell() {
  const { isAuthenticated } = useAuth()
  const {
    notifications,
    unreadCount,
    pagination,
    loading,
    error,
    fetchNotifications,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification
  } = useNotifications(isAuthenticated)
  const [open, setOpen] = useState(false)

  if (!isAuthenticated) {
    return null
  }

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next) {
      fetchNotifications()
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        className="relative p-2 rounded-full text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-600 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationDropdown
          notifications={notifications}
          loading={loading}
          error={error}
          pagination={pagination}
          onClose={() => setOpen(false)}
          onMarkAllRead={markAllAsRead}
          onMarkRead={markAsRead}
          onDelete={deleteNotification}
          onLoadMore={loadMore}
          onRetry={() => fetchNotifications()}
        />
      )}
    </div>
  )
}
