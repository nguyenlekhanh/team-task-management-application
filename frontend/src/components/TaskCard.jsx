import { TaskStatusBadge } from './TaskStatusBadge'
import { PriorityBadge } from './PriorityBadge'
import { format } from 'date-fns'

export function TaskCard({ task, onClick, onStatusChange, onAssign, groupRole, onEdit, onDelete }) {
  const { task: taskData, creator, assignee } = task

  const handleClick = (e) => {
    if (!e.target.closest('button, a, [role="button"]')) {
      onClick?.(taskData)
    }
  }

  return (
    <div
      onClick={handleClick}
      className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 cursor-pointer p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-gray-900 truncate">{taskData.title}</h3>
            <TaskStatusBadge status={taskData.status} />
            <PriorityBadge priority={taskData.priority} />
          </div>

          {taskData.description && (
            <p className="mt-2 text-sm text-gray-500 line-clamp-2">{taskData.description}</p>
          )}

          <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
            {taskData.assignee && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 01-14 0H2" />
                </svg>
                <span className="truncate">{task.assignee.displayName || taskData.assignee.username}</span>
              </span>
            )}

            {taskData.dueDate && (
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className={new Date(taskData.dueDate) < new Date() && taskData.status !== 'completed' ? 'text-red-600' : ''}>
                  Due {format(new Date(taskData.dueDate), 'MMM d, yyyy')}
                </span>
              </span>
            )}

            <span className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Created {format(new Date(taskData.createdAt), 'MMM d, yyyy')}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={(e) => {
              e.stopPropagation()
              // Status change handled by parent
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Change status"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-1.429 5.618m-3.284 0A11.955 11.955 0 0112 2.944 11.955 11.955 0 018.574 10.556" />
            </svg>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="Edit task"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
            }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors"
            title="Delete task"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5.034 7H11.5a2 2 0 010 4H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}