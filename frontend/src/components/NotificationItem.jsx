import { useNavigate } from 'react-router-dom'
import { ClipboardList, CheckCircle2, MessageSquare, Clock, AtSign, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const TYPE_CONFIG = {
  TASK_ASSIGNED: {
    icon: ClipboardList,
    iconClasses: 'bg-blue-100 text-blue-600'
  },
  TASK_COMPLETED: {
    icon: CheckCircle2,
    iconClasses: 'bg-green-100 text-green-600'
  },
  NEW_MESSAGE: {
    icon: MessageSquare,
    iconClasses: 'bg-purple-100 text-purple-600'
  },
  DEADLINE_APPROACHING: {
    icon: Clock,
    iconClasses: 'bg-orange-100 text-orange-600'
  },
  MENTION: {
    icon: AtSign,
    iconClasses: 'bg-pink-100 text-pink-600'
  }
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return ''
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
  } catch {
    return ''
  }
}

export function NotificationItem({ notification, onMarkRead, onDelete }) {
  const navigate = useNavigate()
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.NEW_MESSAGE
  const Icon = config.icon

  const getTargetPath = () => {
    const meta = notification.metadata || {}
    if (meta.taskId && meta.groupId) {
      return `/groups/${meta.groupId}/tasks/${meta.taskId}`
    }
    if (notification.groupId && notification.taskId) {
      return `/groups/${notification.groupId}/tasks/${notification.taskId}`
    }
    if (meta.groupId) {
      return `/groups/${meta.groupId}`
    }
    if (notification.groupId) {
      return `/groups/${notification.groupId}`
    }
    return null
  }

  const handleClick = async () => {
    if (!notification.isRead) {
      onMarkRead(notification.id)
    }
    const path = getTargetPath()
    if (path) {
      navigate(path)
    }
  }

  const handleDelete = (e) => {
    e.stopPropagation()
    onDelete(notification.id)
  }

  const path = getTargetPath()

  return (
    <div
      onClick={handleClick}
      role={path ? 'button' : undefined}
      tabIndex={path ? 0 : undefined}
      onKeyDown={(e) => {
        if (path && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          handleClick()
        }
      }}
      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 transition-colors ${
        path ? 'cursor-pointer' : ''
      } ${!notification.isRead ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'}`}
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${config.iconClasses}`}>
        <Icon className="w-5 h-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm truncate ${!notification.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
            {notification.title}
          </p>
          {!notification.isRead && (
            <span className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full" aria-label="Unread"></span>
          )}
        </div>
        <p className="text-sm text-gray-600 line-clamp-2 break-words">{notification.message}</p>
        <p className="text-xs text-gray-400 mt-1">{formatRelativeTime(notification.createdAt)}</p>
      </div>

      <button
        onClick={handleDelete}
        title="Delete notification"
        aria-label="Delete notification"
        className="flex-shrink-0 p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}
