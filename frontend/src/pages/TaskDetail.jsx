import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { taskApi, groupApi, messageApi } from '../services/api'
import { TaskStatusBadge } from '../components/TaskStatusBadge'
import { PriorityBadge } from '../components/PriorityBadge'
import { CreateTaskModal } from '../components/CreateTaskModal'
import { EditTaskModal } from '../components/EditTaskModal'
import { Checklist } from '../components/Checklist'
import { CommentSection } from '../components/CommentSection'
import { format } from 'date-fns'
import { getRoleColor } from '../utils/permissions'
import { NotificationBell } from '../components/NotificationBell'

export function TaskDetail() {
  const { id } = useParams()
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [groupMembers, setGroupMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [checklistItems, setChecklistItems] = useState([])

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    fetchTask()
    fetchGroupMembers()
  }, [isAuthenticated, id])

  useEffect(() => {
    if (task) {
      fetchChecklist()
    }
  }, [task, id])

  const fetchTask = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await taskApi.get(id)
      setTask(response.data.task)
    } catch (err) {
      if (err.response?.status === 401) {
        window.location.href = '/login'
        return
      }
      if (err.response?.status === 404) {
        setError('Task not found')
      } else {
        setError(err.message || 'Failed to fetch task')
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchGroupMembers = async () => {
    if (!task?.groupId) return
    try {
      const response = await groupApi.getMembers(task.groupId)
      setGroupMembers(response.data.members)
    } catch (err) {
      console.error('Failed to fetch group members:', err)
    }
  }

  const fetchChecklist = async () => {
    try {
      const response = await taskApi.getChecklist(id)
      setChecklistItems(response.data.items)
    } catch (err) {
      console.error('Failed to fetch checklist:', err)
    }
  }

  const handleAddChecklistItem = async (data) => {
    try {
      const response = await taskApi.addChecklistItem(id, data)
      setChecklistItems(prev => [...prev, response.data.item])
    } catch (err) {
      console.error('Failed to add checklist item:', err)
      throw err
    }
  }

  const handleToggleChecklistItem = async (itemId, isCompleted) => {
    try {
      const response = await taskApi.toggleChecklistItem(id, itemId, { isCompleted })
      setChecklistItems(prev => prev.map(item => item.id === itemId ? response.data.item : item))
    } catch (err) {
      console.error('Failed to toggle checklist item:', err)
      throw err
    }
  }

  const handleUpdateChecklistItem = async (itemId, data) => {
    try {
      const response = await taskApi.updateChecklistItem(id, itemId, data)
      setChecklistItems(prev => prev.map(item => item.id === itemId ? response.data.item : item))
    } catch (err) {
      console.error('Failed to update checklist item:', err)
      throw err
    }
  }

  const handleDeleteChecklistItem = async (itemId) => {
    try {
      await taskApi.deleteChecklistItem(id, itemId)
      setChecklistItems(prev => prev.filter(item => item.id !== itemId))
    } catch (err) {
      console.error('Failed to delete checklist item:', err)
      throw err
    }
  }

  const handleStatusChange = async (status) => {
    try {
      await taskApi.updateStatus(id, { status })
      const updatedTask = { ...task, status, completedAt: status === 'completed' ? new Date().toISOString() : null }
      setTask(updatedTask)
    } catch (err) {
      console.error('Failed to update status:', err)
    }
  }

  const handleAssign = async (assigneeId) => {
    try {
      await taskApi.assign(id, { assigneeId })
      const updatedTask = { ...task, assigneeId: assigneeId || null }
      setTask(updatedTask)
    } catch (err) {
      console.error('Failed to assign task:', err)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      await taskApi.delete(id)
      window.location.href = `/groups/${task.groupId}/tasks`
    } catch (err) {
      console.error('Failed to delete task:', err)
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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Task Not Found</h2>
          <p className="text-gray-600 mb-8">{error}</p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  if (!task) {
    return <div>Loading...</div>
  }

  const isOwner = task.group?.ownerId === user?.id
  const isAdmin = task.group?.members?.some(m => m.userId === user?.id && m.role === 'admin')
  const isCreator = task.creatorId === user?.id
  const isAssignee = task.assigneeId === user?.id
  const isMember = task.group?.members?.some(m => m.userId === user?.id)

  const canEdit = isOwner || isAdmin || isCreator
  const canDelete = isOwner || isAdmin || isCreator
  const canAssign = isOwner || isAdmin
  const canUpdateStatus = isOwner || isAdmin || isCreator || isAssignee

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to={`/groups/${task.groupId}`} className="text-blue-600 hover:text-blue-800 text-sm mb-2 inline-block">
                ← Back to Group
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 ml-4">{task.title}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationBell />
              <span className="text-sm text-gray-700">
                Logged in as <strong>{user?.displayName || user?.username}</strong>
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
            <button onClick={() => setError('')} className="ml-2 text-red-700 hover:underline">Dismiss</button>
          </div>
        )}

        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <Link to={`/groups/${task.groupId}/tasks`} className="text-blue-600 hover:text-blue-900 text-sm mb-2 inline-block">
                ← Back to Tasks
              </Link>
              <h2 className="text-2xl font-bold text-gray-900">{task.title}</h2>
              <p className="text-gray-600 mt-1">{task.description || 'No description'}</p>
            </div>
            <div className="flex items-center space-x-2">
              <TaskStatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Task Info */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Information</h3>
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Task ID</dt>
                  <dd className="text-sm text-gray-900 mt-1">{task.id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created By</dt>
                  <dd className="text-sm text-gray-900 mt-1">{task.creator?.displayName || task.creator?.username}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Assigned To</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {task.assignee ? task.assignee.displayName || task.assignee.username : 'Unassigned'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="mt-1">
                    <TaskStatusBadge status={task.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Priority</dt>
                  <dd className="mt-1">
                    <PriorityBadge priority={task.priority} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Start Date</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {task.startDate ? format(new Date(task.startDate), 'MMM d, yyyy') : 'Not set'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Due Date</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : 'Not set'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Completed At</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {task.completedAt ? format(new Date(task.completedAt), 'MMM d, yyyy HH:mm') : 'Not completed'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {format(new Date(task.createdAt), 'MMM d, yyyy HH:mm')}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {format(new Date(task.updatedAt), 'MMM d, yyyy HH:mm')}
                  </dd>
                </div>
              </dl>
            </div>

            {task.description && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                <div className="prose max-w-none text-gray-700">{task.description}</div>
              </div>
            )}
          </div>

          {/* Checklist */}
          <Checklist
            taskId={id}
            items={checklistItems}
            onAdd={handleAddChecklistItem}
            onToggle={handleToggleChecklistItem}
            onUpdate={handleUpdateChecklistItem}
            onDelete={handleDeleteChecklistItem}
            canManage={true}
          />

          {/* Comments */}
          <CommentSection taskId={id} currentUserId={user.id} />
      </div>

        {/* Sidebar - Actions & Members */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
            <div className="space-y-3">
              {canUpdateStatus && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Change Status</label>
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
              )}

              {canAssign && groupMembers.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
                  <select
                    value={task.assigneeId || ''}
                    onChange={(e) => handleAssign(e.target.value || null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Unassign</option>
                    {groupMembers.map(m => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.displayName || m.user.username} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {canEdit && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Edit Task
                </button>
              )}

              {canDelete && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete Task
                </button>
              )}
            </div>
          </div>

          {/* Members */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Members ({groupMembers.length})</h3>
            <div className="space-y-2">
              {groupMembers.map(member => (
                <div key={member.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-600 font-medium text-sm">
                        {member.user.username?.charAt(0).toUpperCase() || 'U'}
                      </span>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{member.user.displayName || member.user.username}</p>
                      <p className="text-xs text-gray-500">{member.user.username}</p>
                    </div>
                  </div>
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(member.role)}`}>
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
</div>
      </div>

      <EditTaskModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        task={task}
        groupMembers={groupMembers}
        onTaskUpdated={fetchTask}
      />
    </main>
  </div>
  )
}

export default TaskDetail