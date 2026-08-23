import { useState, useEffect } from 'react'
import { notificationApi } from '../services/api'

const NOTIFICATION_TYPE_OPTIONS = [
  {
    key: 'taskAssigned',
    label: 'Task assignments',
    description: 'When someone assigns a task to you'
  },
  {
    key: 'taskCompleted',
    label: 'Task completions',
    description: 'When a task you created or follow is completed'
  },
  {
    key: 'newMessage',
    label: 'New messages & comments',
    description: 'When someone sends a group message or comments on your task'
  },
  {
    key: 'deadlineApproaching',
    label: 'Deadline reminders',
    description: 'When a task is due within 24 hours'
  },
  {
    key: 'mention',
    label: 'Mentions',
    description: 'When someone mentions you with @username'
  }
]

export function NotificationSettings() {
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await notificationApi.getPreferences()
        setPreferences(response.data.preferences)
      } catch {
        setError('Failed to load notification preferences')
      } finally {
        setLoading(false)
      }
    }
    loadPreferences()
  }, [])

  const handleToggle = (key) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }))
    setError('')
    setSuccess('')
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const response = await notificationApi.updatePreferences(preferences)
      setPreferences(response.data.preferences)
      setSuccess('Notification preferences updated')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update notification preferences')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" role="status" aria-label="Loading preferences">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!preferences) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-red-600 mb-3">{error || 'Unable to load preferences'}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs"
        >
          Reload page
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 bg-green-50 text-green-600 rounded text-sm">{success}</div>
      )}

      <p className="text-sm text-gray-600">
        Choose which notifications you want to receive. Disabled types will not be created for you.
      </p>

      <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {NOTIFICATION_TYPE_OPTIONS.map(option => (
          <div key={option.key} className="flex items-start justify-between gap-4 p-4">
            <div>
              <label htmlFor={`pref-${option.key}`} className="block text-sm font-medium text-gray-900">
                {option.label}
              </label>
              <p className="text-sm text-gray-500 mt-0.5">{option.description}</p>
            </div>
            <button
              id={`pref-${option.key}`}
              type="button"
              role="switch"
              aria-checked={preferences[option.key]}
              onClick={() => handleToggle(option.key)}
              className={`relative inline-flex flex-shrink-0 h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                preferences[option.key] ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 bg-white rounded-full shadow transform transition-transform ${
                  preferences[option.key] ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
                style={{ marginTop: '2px' }}
              />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  )
}
