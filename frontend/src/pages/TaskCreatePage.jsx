import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { taskApi, groupApi, getApiErrorMessage } from '../services/api'
import { TaskForm } from '../components/TaskForm'
import { NotificationBell } from '../components/NotificationBell'

export function TaskCreatePage() {
  const { groupId } = useParams()
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  const [groupMembers, setGroupMembers] = useState(null) // null = loading
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    ;(async () => {
      try {
        const response = await groupApi.getMembers(groupId)
        if (!cancelled) setGroupMembers(response.data.members)
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load group members'))
        if (!cancelled) setGroupMembers([])
      }
    })()
    return () => { cancelled = true }
  }, [isAuthenticated, groupId])

  const isMember = groupMembers?.some(m => m.userId === user?.id)

  const onSubmit = async (data) => {
    setSubmitting(true)
    setError('')
    try {
      const payload = {
        title: data.title,
        description: data.description || null,
        assigneeId: data.assigneeId ? Number(data.assigneeId) : null,
        priority: data.priority,
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
      }
      const response = await taskApi.create(groupId, payload)
      navigate(`/groups/${groupId}/tasks/${response.data.task.id}`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to create task'))
      setSubmitting(false)
    }
  }

  if (!isAuthenticated || groupMembers === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" role="status" aria-label="Loading"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to={`/groups/${groupId}/tasks`} className="text-sm text-blue-600 hover:text-blue-900">
                ← Back to Tasks
              </Link>
              <h1 className="text-xl font-bold text-gray-900 ml-4">Create Task</h1>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationBell />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isMember ? (
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <h2 className="text-lg font-medium text-gray-900 mb-2">You are not a member of this group</h2>
            <p className="text-sm text-gray-600 mb-6">Only group members can create tasks.</p>
            <Link to={`/groups/${groupId}/tasks`} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
              Back to Tasks
            </Link>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg p-6">
            <TaskForm
              defaultValues={{ priority: 'medium' }}
              groupMembers={groupMembers}
              submitting={submitting}
              error={error}
              onSubmit={onSubmit}
              submitLabel="Create Task"
              onCancel={() => navigate(`/groups/${groupId}/tasks`)}
            />
          </div>
        )}
      </main>
    </div>
  )
}

export default TaskCreatePage
