import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { taskApi } from '../services/api'
import { TaskCard } from '../components/TaskCard'
import { TaskFilter } from '../components/TaskFilter'
import { TaskStatusBadge } from '../components/TaskStatusBadge'
import { PriorityBadge } from '../components/PriorityBadge'
import { format } from 'date-fns'
import { NotificationBell } from '../components/NotificationBell'

export function MyTasks() {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }
    fetchTasks()
  }, [isAuthenticated, filters])

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
    setError(err.response?.data?.error || 'Failed to fetch tasks')
  } finally {
    setLoading(false)
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
      const newSortBy = field
      const newSortOrder = prev.sortBy === field && prev.sortOrder === 'DESC' ? 'ASC' : 'DESC'
      return {
        ...prev,
        sortBy: field,
        sortOrder: newSortOrder,
        page: 1,
      }
    })
  }

  const handleStatusChange = async (taskId, status) => {
    try {
      await taskApi.updateStatus(taskId, { status })
      fetchTasks()
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  const handleAssign = async (taskId, assigneeId) => {
    try {
      await taskApi.assign(taskId, { assigneeId })
      fetchTasks()
    } catch (err) {
      console.error('Failed to assign task:', err)
    }
  }

  if (!isAuthenticated) {
    return <div>Loading...</div>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
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
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">My Tasks</h2>
          <p className="text-gray-600 mt-1">View and manage all tasks assigned to you or created by you across all groups</p>
        </div>

        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Tasks</h2>
            <p className="text-gray-600 mt-1">View and manage all tasks assigned to you or created by you across all groups</p>
          </div>
        </div>

        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">My Tasks</h2>
            <p className="text-gray-600 mt-1">View and manage all tasks assigned to you or created by you across all groups</p>
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>

        <TaskFilter
          filters={filters}
          onChange={(key, value) => setFilters(prev => ({ ...prev, [key]: value, page: 1 }))}
          onClear={() => setFilters({
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
          })}
        />

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 000 4h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-1.429 5.618m-3.284 0A11.955 11.955 0 0112 2.944 11.955 11.955 0 018.574 10.556" />
            </svg>
            <h3 className="mt-2 text-lg font-medium text-gray-900">No tasks found</h3>
            <p className="mt-1 text-sm text-gray-500">You don't have any tasks yet.</p>
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tasks.map(task => (
                <tr key={task.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link to={`/groups/${task.groupId}/tasks/${task.id}`} className="text-blue-600 hover:text-blue-900 font-medium">
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {task.group?.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <TaskStatusBadge status={task.status} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(task.createdAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <a href={`/groups/${task.groupId}/tasks/${task.id}`} className="text-blue-600 hover:text-blue-900 text-sm">
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {pagination.page * pagination.limit - pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} tasks
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm text-gray-700">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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

export default MyTasks