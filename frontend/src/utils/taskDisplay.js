import { format } from 'date-fns'

// Shared task display helpers — standardizes date/overdue/status presentation
// across TaskList, MyTasks, and TaskDetail (5F.6 consistency).

export function formatTaskDate(value, fallback = '—') {
  if (!value) return fallback
  try {
    return format(new Date(value), 'MMM d, yyyy')
  } catch {
    return fallback
  }
}

export function formatTaskDateTime(value, fallback = '—') {
  if (!value) return fallback
  try {
    return format(new Date(value), 'MMM d, yyyy HH:mm')
  } catch {
    return fallback
  }
}

export function isTaskOverdue(task) {
  return Boolean(task?.dueDate && task.status !== 'completed' && new Date(task.dueDate) < new Date())
}
