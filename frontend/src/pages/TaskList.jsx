import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { taskApi, groupApi, getApiErrorMessage } from '../services/api'
import { TaskFilter } from '../components/TaskFilter'
import { TaskStatusBadge } from '../components/TaskStatusBadge'
import { PriorityBadge } from '../components/PriorityBadge'
import { NotificationBell } from '../components/NotificationBell'
import { formatTaskDate, isTaskOverdue } from '../utils/taskDisplay'

export function TaskList() {
  const { groupId } = useParams()
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [rowSaving, setRowSaving] = useState({})
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    assigneeId: '',
    creatorId: '',
    search: '',
    startDate: '',
    endDate: '',
    sortBy: 'createdAt',
    sortOrder: 'DESC',
    page: 1,
    limit: 20,
  })
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 })
  const [groupMembers, setGroupMembers] = useState([])

  // Debounced search: typing must not fire a request per keystroke.
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }
    fetchGroupMembers()
    fetchTasks()
  }, [isAuthenticated, groupId, filters])

  // Sync debounced input into filters.search
  useEffect(() => {
    if (searchInput === (filters.search || '')) return undefined
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput, page: 1 }))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const fetchGroupMembers = async () => {
    try {
      const response = await groupApi.getMembers(groupId)
      setGroupMembers(response.data.members)
    } catch (err) {
      console.error('Failed to fetch group members:', err)
    }
  }

  const fetchTasks = async () => {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value)
        }
      })

      const response = await taskApi.list(groupId, Object.fromEntries(params))
      setTasks(response.data.tasks)
      setPagination(response.data.pagination)
    } catch (err) {
      if (err.response?.status === 401) {
        window.location.href = '/login'
        return
      }
      setError(getApiErrorMessage(err, 'Failed to fetch tasks'))
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1,
    }))
  }

  const handleClearFilters = () => {
    setFilters({
      status: '',
      priority: '',
      assigneeId: '',
      creatorId: '',
      search: '',
      startDate: '',
      endDate: '',
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      page: 1,
      limit: 20,
    })
  }

  const handlePageChange = (page) => {
    setFilters(prev => ({ ...prev, page }))
  }

  const handleSortChange = (field) => {
    setFilters(prev => {
      const newSortOrder = prev.sortBy === field && prev.sortOrder === 'DESC' ? 'ASC' : 'DESC'
      return {
        ...prev,
        sortBy: field,
        sortOrder: newSortOrder,
        page: 1,
      }
    })
  }

  const getTaskPermissions = (task) => {
    const myRole = groupMembers.find(m => m.userId === user?.id)?.role
    const isOwner = myRole === 'owner'
    const isAdmin = myRole === 'admin'
    const isCreator = task.creatorId === user?.id
    const isAssignee = task.assigneeId === user?.id
    const creatorIsOwner = groupMembers.find(m => m.userId === task.creatorId)?.role === 'owner'
    return {
      canUpdateStatus: isOwner || isAdmin || isCreator || isAssignee,
      canEdit: isOwner || isAdmin || isCreator,
      canAssign: isOwner || isAdmin,
      canDelete: (isOwner || isAdmin || isCreator) && !(isAdmin && creatorIsOwner),
    }
  }

  const handleStatusChange = async (task, newStatus) => {
    if (task.status === newStatus || rowSaving[task.id]) return
    setRowSaving(prev => ({ ...prev, [task.id]: 'status' }))
    setError('')
    try {
      const response = await taskApi.updateStatus(task.id, { status: newStatus })
      setTasks(prev => prev.map(t => t.id === task.id ? response.data.task : t))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update status'))
    } finally {
      setRowSaving(prev => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
    }
  }

  const handlePriorityChange = async (task, newPriority) => {
    if (task.priority === newPriority || rowSaving[task.id]) return
    setRowSaving(prev => ({ ...prev, [task.id]: 'priority' }))
    setError('')
    try {
      const response = await taskApi.update(task.id, { priority: newPriority })
      setTasks(prev => prev.map(t => t.id === task.id ? response.data.task : t))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update priority'))
    } finally {
      setRowSaving(prev => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
    }
  }

  const handleAssigneeChange = async (task, newAssigneeId) => {
    const normalized = newAssigneeId ? Number(newAssigneeId) : null
    const current = task.assigneeId || null
    if (normalized === current || rowSaving[task.id]) return
    setRowSaving(prev => ({ ...prev, [task.id]: 'assignee' }))
    setError('')
    try {
      const response = await taskApi.update(task.id, { assigneeId: normalized })
      setTasks(prev => prev.map(t => t.id === task.id ? response.data.task : t))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update assignee'))
    } finally {
      setRowSaving(prev => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
    }
  }

  const handleDelete = async (task) => {
    if (rowSaving[task.id]) return
    if (!confirm(`Delete task "${task.title}"?`)) return
    setRowSaving(prev => ({ ...prev, [task.id]: 'delete' }))
    setError('')
    try {
      await taskApi.delete(task.id)
      const remaining = tasks.filter(t => t.id !== task.id)
      // Pagination edge: last item on page beyond first page
      if (remaining.length === 0 && pagination.page > 1) {
        setFilters(prev => ({ ...prev, page: prev.page - 1 }))
      } else {
        setTasks(remaining)
        setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - 1), totalPages: Math.max(1, Math.ceil(Math.max(0, prev.total - 1) / prev.limit)) }))
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to delete task'))
    } finally {
      setRowSaving(prev => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
    }
  }

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" role="status" aria-label="Loading tasks"></div>
      </div>
    )
  }

  if (error && tasks.length === 0 && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Failed to load tasks</h2>
          <p className="text-gray-600 mb-8">{error}</p>
          <button
            onClick={() => fetchTasks()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 min-h-[44px]"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const canCreateTask = groupMembers.some(m => m.userId === user.id)

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to={`/groups/${groupId}`} className="text-blue-600 hover:text-blue-900 text-sm mb-2 inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                ← Back to Group
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationBell />
              <span className="text-sm text-gray-700">
                Logged in as <strong>{user?.displayName || user?.username}</strong>
              </span>
              <Link to="/dashboard" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                Dashboard
              </Link>
              <Link to="/groups" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                Groups
              </Link>
              <Link to="/profile" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                Profile
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Tasks</h2>
            <p className="text-gray-600 mt-1">Manage tasks for this group</p>
          </div>
          <button
            onClick={() => navigate(`/groups/${groupId}/tasks/new`)}
            disabled={!canCreateTask}
            aria-label="Create new task"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Create Task
          </button>
        </div>

        {error && tasks.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded text-sm flex justify-between items-center" role="alert">
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-2 text-red-700 hover:underline text-sm" aria-label="Dismiss error">Dismiss</button>
          </div>
        )}

        <TaskFilter
          filters={{ ...filters, search: searchInput }}
          onChange={(key, value) => {
            if (key === 'search') {
              setSearchInput(value || '')
            } else {
              setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
            }
          }}
          onClear={() => {
            setSearchInput('')
            handleClearFilters()
          }}
          groupMembers={groupMembers}
        />

        {!initialLoading && loading && (
          <div className="flex items-center justify-center py-3 text-sm text-gray-500" role="status" aria-live="polite">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            Refreshing tasks…
          </div>
        )}

        {!initialLoading && !loading && !error && tasks.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 000 4h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-1.429 5.618m-3.284 0A11.955 11.955 0 0112 2.944 11.955 11.955 0 018.574 10.556" />
            </svg>
            {filters.search || filters.status || filters.priority || filters.assigneeId || filters.creatorId || filters.startDate || filters.endDate ? (
              <>
                <h3 className="mt-2 text-lg font-medium text-gray-900">No matching tasks</h3>
                <p className="mt-1 text-sm text-gray-500">No tasks match your current filters or search.</p>
                <button
                  onClick={() => { setSearchInput(''); handleClearFilters() }}
                  className="mt-4 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 min-h-[44px]"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <h3 className="mt-2 text-lg font-medium text-gray-900">No tasks found</h3>
                <p className="mt-1 text-sm text-gray-500">No tasks found for this group.</p>
                {canCreateTask && (
                  <button
                    onClick={() => navigate(`/groups/${groupId}/tasks/new`)}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 min-h-[44px]"
                  >
                    Create Task
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assignee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Creator</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tasks.map(task => {
                  const overdue = isTaskOverdue(task)
                  const perms = getTaskPermissions(task)
                  const savingField = rowSaving[task.id]
                  return (
                    <tr key={task.id} className="hover:bg-gray-50" aria-busy={savingField ? 'true' : 'false'}>
                      <td className="px-6 py-4">
                        <Link to={`/groups/${groupId}/tasks/${task.id}`} className="text-blue-600 hover:text-blue-900 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                          {task.title}
                        </Link>
                        {task.description && (
                          <p className="text-sm text-gray-500 truncate mt-1">{task.description}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {perms.canUpdateStatus ? (
                          <select
                            value={task.status}
                            disabled={!!savingField}
                            aria-label={`Change status for ${task.title}`}
                            aria-busy={savingField === 'status' ? 'true' : 'false'}
                            onChange={(e) => handleStatusChange(task, e.target.value)}
                            className="text-xs font-medium rounded-full border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 min-h-[32px]"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                          </select>
                        ) : (
                          <TaskStatusBadge status={task.status} />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {perms.canEdit ? (
                          <select
                            value={task.priority}
                            disabled={!!savingField}
                            aria-label={`Change priority for ${task.title}`}
                            aria-busy={savingField === 'priority' ? 'true' : 'false'}
                            onChange={(e) => handlePriorityChange(task, e.target.value)}
                            className="text-xs font-medium rounded-full border border-gray-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 min-h-[32px]"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        ) : (
                          <PriorityBadge priority={task.priority} />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {perms.canAssign ? (
                          <select
                            value={task.assigneeId || ''}
                            disabled={!!savingField}
                            aria-label={`Change assignee for ${task.title}`}
                            aria-busy={savingField === 'assignee' ? 'true' : 'false'}
                            onChange={(e) => handleAssigneeChange(task, e.target.value)}
                            className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 min-h-[32px]"
                          >
                            <option value="">Unassigned</option>
                            {groupMembers.map(m => (
                              <option key={m.userId} value={m.userId}>{m.user.displayName || m.user.username}</option>
                            ))}
                          </select>
                        ) : task.assignee ? (
                          <span className="text-sm font-medium text-gray-900">{task.assignee.displayName || task.assignee.username}</span>
                        ) : (
                          <span className="text-sm text-gray-500">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {task.creator ? (
                          <span className="text-sm text-gray-700">{task.creator.displayName || task.creator.username}</span>
                        ) : (
                          <span className="text-sm text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {task.dueDate ? (
                          <>
                            <span className={overdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                              {formatTaskDate(task.dueDate)}
                            </span>
                            {overdue && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" aria-label="Overdue">
                                Overdue
                              </span>
                            )}
                            <p className="text-xs text-gray-400">
                              {task.startDate ? `Starts ${formatTaskDate(task.startDate)}` : '\u00A0'}
                            </p>
                          </>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatTaskDate(task.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/groups/${groupId}/tasks/${task.id}`} className="text-blue-600 hover:text-blue-900 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1">
                            View
                          </Link>
                          {perms.canDelete && (
                            <button
                              onClick={() => handleDelete(task)}
                              disabled={!!savingField}
                              aria-label={`Delete task ${task.title}`}
                              className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[32px] px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
                            >
                              {savingField === 'delete' ? '…' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {pagination.page * pagination.limit - pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} tasks
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1 || loading}
                aria-label="Go to previous page"
                className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm text-gray-700" aria-live="polite" aria-atomic="true">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages || loading}
                aria-label="Go to next page"
                className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
  </div>
  )
}

export default TaskList
