import { getStatusColor } from '../utils/permissions'

export function TaskStatusBadge({ status }) {
  const colorClass = getStatusColor(status)

  const labels = {
    todo: 'To Do',
    in_progress: 'In Progress',
    completed: 'Completed',
    overdue: 'Overdue',
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
      {labels[status] || status}
    </span>
  )
}