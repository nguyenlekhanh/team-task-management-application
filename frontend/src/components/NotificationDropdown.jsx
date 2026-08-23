import { useEffect, useRef } from 'react'
import { CheckCheck, Inbox } from 'lucide-react'
import { NotificationItem } from './NotificationItem'

export function NotificationDropdown({
  notifications,
  loading,
  error,
  pagination,
  onClose,
  onMarkAllRead,
  onMarkRead,
  onDelete,
  onLoadMore,
  onRetry
}) {
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose()
      }
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 mt-2 w-full sm:w-96 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-lg border border-gray-200 z-50"
      role="dialog"
      aria-label="Notifications"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
        <button
          onClick={onMarkAllRead}
          disabled={loading || !notifications.some(n => !n.isRead)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed focus:outline-none"
        >
          <CheckCheck className="w-4 h-4" />
          Mark all read
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8" role="status" aria-label="Loading notifications">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-600 mb-3">{error}</p>
            <button
              onClick={onRetry}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs"
            >
              Try again
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No notifications yet</p>
          </div>
        ) : (
          notifications.map(notification => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={onMarkRead}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      {!loading && !error && pagination.hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full py-2.5 text-xs font-medium text-blue-600 hover:bg-gray-50 border-t border-gray-100 focus:outline-none"
        >
          Load more
        </button>
      )}
    </div>
  )
}
