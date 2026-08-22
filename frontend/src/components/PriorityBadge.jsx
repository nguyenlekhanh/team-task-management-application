import { getPriorityColor } from '../utils/permissions'

export function PriorityBadge({ priority }) {
  const colorClass = getPriorityColor(priority)

  const labels = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    urgent: 'Urgent',
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(priority)}`}>
      {labels[priority] || priority}
    </span>
  )
}