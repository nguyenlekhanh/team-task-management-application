import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { taskApi, getApiErrorMessage } from '../services/api'
import { TaskFilter } from '../components/TaskFilter'
import { TaskStatusBadge } from '../components/TaskStatusBadge'
import { PriorityBadge } from '../components/PriorityBadge'
import { NotificationBell } from '../components/NotificationBell'
import { formatTaskDate, isTaskOverdue } from '../utils/taskDisplay'

const EMPTY_FILTERS = {
  scope: 'assigned',
  status: '',
  priority: '',
  search: '',
  sortBy: 'dueDate',
  sortOrder: 'ASC',
  page: 1,
  limit: 20,
}

export function MyTasks() {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS })
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 })

  // Debounced search (same convention as TaskList)
  const [searchInput, setSearchInput] = useState('')
  const hasActiveNarrowing = Boolean(
    filters.status || filters.priority || filters.search
  )

  useEffect(() => {
    if (!isAuthenticated) return
    fetchTasks()
  }, [isAuthenticated, filters])

  useEffect(() => {
    if (searchInput === (filters.search || '')) return undefined
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput, page: 1 }))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const fetchTasks = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await taskApi.getMyTasks(filters)
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

  const handlePageChange = (page) => {
    setFilters(prev => ({ ...prev, page }))
  }

  const handleClearFilters = () => {
    setSearchInput('')
    setFilters({ ...EMPTY_FILTERS })
  }

  if (!isAuthenticated) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">My Tasks</h1>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationBell />
              <span className="text-sm text-gray-700">
                Logged in as <strong>{user?.displayName || user?.username}</strong>
              </span>
              <Link to="/dashboard" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">
                Dashboard
              </Link>
              <Link to="/groups" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">
                Groups
              </Link>
              <Link to="/profile" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">
                Profile
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Tasks</h2>
            <p className="text-gray-600 mt-1">Tasks across all your groups</p>
          </div>
        </div>

        {/* Scope selector: server derives identity — the client never sends a userId */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <label htmlFor="scope" className="block text-sm font-medium text-gray-700 mb-1">
            Show tasks
          </label>
          <select
            id="scope"
            value={filters.scope}
            onChange={(e) => setFilters(prev => ({ ...prev, scope: e.target.value, page: 1 }))}
            className="w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="assigned">Assigned to me</option>
            <option value="created">Created by me</option>
            <option value="">All in my groups</option>
          </select>
        </div>

        <TaskFilter
          filters={filters}
          onChange={(key, value) => {
            if (key === 'search') {
              setSearchInput(value || '')
            } else {
              setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
            }
          }}
          onClear={handleClearFilters}
        />

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded text-sm" role="alert">
            {error}
          </div>
        )}

        {!initialLoading && loading && (
          <div className="flex items-center justify-center py-3 text-sm text-gray-500" role="status">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            Refreshing tasks…
          </div>
        )}

        {!initialLoading && !loading && !error && tasks.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 000 4h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-1.429 5.618m-3.284 0A11.955 11.955 0 0112 2.944 11.955 11.955 0 018.574 10.556" />
            </svg>
            {hasActiveNarrowing ? (
              <>
                <h3 className="mt-2 text-lg font-medium text-gray-900">No matching tasks</h3>
                <p className="mt-1 text-sm text-gray-500">No tasks match your current filters or search.</p>
                <button
                  onClick={handleClearFilters}
                  className="mt-4 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <h3 className="mt-2 text-lg font-medium text-gray-900">No tasks yet</h3>
                <p className="mt-1 text-sm text-gray-500">Tasks assigned or created by you will appear here.</p>
                <Link
                  to="/groups"
                  className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Go to Groups
                </Link>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tasks.map(task => {
                  const overdue = isTaskOverdue(task)
                  return (
                    <tr key={task.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <Link to={`/groups/${task.groupId}/tasks/${task.id}`} className="text-blue-600 hover:text-blue-900 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                          {task.title}
                        </Link>
                        {task.description && (
                          <p className="text-sm text-gray-500 truncate mt-1">{task.description}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {task.group?.name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <TaskStatusBadge status={task.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <PriorityBadge priority={task.priority} />
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
                          </>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Link to={`/groups/${task.groupId}/tasks/${task.id}`} className="text-blue-600 hover:text-blue-900 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
        </div>
      </main>
    </div>
  )
}

export default MyTasks
