import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { taskApi, groupApi, getApiErrorMessage } from '../services/api'
import { TaskForm } from '../components/TaskForm'
import { NotificationBell } from '../components/NotificationBell'

export function TaskEditPage() {
  const { groupId, taskId } = useParams()
  const navigate = useNavigate()

  const [task, setTask] = useState(null)
  const [groupMembers, setGroupMembers] = useState(null) // null = loading
  const [loadError, setLoadError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [taskRes, membersRes] = await Promise.all([
          taskApi.get(taskId),
          groupApi.getMembers(groupId).catch(() => ({ data: { members: [] } }))
        ])
        if (cancelled) return
        setTask(taskRes.data.task)
        setGroupMembers(membersRes.data.members)
      } catch (err) {
        if (cancelled) return
        if (err.response?.status === 401) {
          window.location.href = '/login'
          return
        }
        setLoadError(getApiErrorMessage(err, 'Failed to load task'))
        setGroupMembers([])
      }
    })()
    return () => { cancelled = true }
  }, [groupId, taskId])

  // Group-context guard: the fetched task must belong to the group in the URL.
  useEffect(() => {
    if (task && groupId && Number(task.groupId) !== Number(groupId)) {
      setLoadError('This task does not belong to the selected group.')
    }
  }, [task, groupId])

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
      await taskApi.update(taskId, payload)
      navigate(`/groups/${task.groupId}/tasks/${taskId}`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update task'))
      setSubmitting(false)
    }
  }

  if (groupMembers === null && !loadError) {
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
              <Link to={`/groups/${groupId}/tasks/${taskId}`} className="text-sm text-blue-600 hover:text-blue-900">
                ← Back to Task
              </Link>
              <h1 className="text-xl font-bold text-gray-900 ml-4">Edit Task</h1>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationBell />
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loadError ? (
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <h2 className="text-lg font-medium text-gray-900 mb-2">{loadError}</h2>
            <Link to={`/groups/${groupId}/tasks`} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm inline-block mt-4">
              Back to Tasks
            </Link>
          </div>
        ) : task ? (
          <div className="bg-white shadow rounded-lg p-6">
            <TaskForm
              key={task.id}
              defaultValues={{
                title: task.title || '',
                description: task.description || '',
                assigneeId: task.assigneeId || '',
                priority: task.priority || 'medium',
                startDate: task.startDate ? task.startDate.split('T')[0] : '',
                dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
              }}
              groupMembers={groupMembers}
              submitting={submitting}
              error={error}
              onSubmit={onSubmit}
              submitLabel="Save Changes"
              onCancel={() => navigate(`/groups/${groupId}/tasks/${taskId}`)}
            />
            <p className="mt-4 text-xs text-gray-500">
              Status changes are made from the task page.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  )
}

export default TaskEditPage
