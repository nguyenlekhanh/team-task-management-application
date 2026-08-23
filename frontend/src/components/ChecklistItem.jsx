import { useState } from 'react'
import { format } from 'date-fns'

export function ChecklistItem({ item, onToggle, onUpdate, onDelete, canManage }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(item.title)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleToggle = async () => {
    try {
      await onToggle(item.id, !item.isCompleted)
    } catch (err) {
      console.error('Failed to toggle checklist item:', err)
    }
  }

  const handleSave = async () => {
    if (!editTitle.trim()) return
    setSaving(true)
    try {
      await onUpdate(item.id, { title: editTitle.trim() })
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to update checklist item:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this checklist item?')) return
    setDeleting(true)
    try {
      await onDelete(item.id)
    } catch (err) {
      console.error('Failed to delete checklist item:', err)
    } finally {
      setDeleting(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setEditTitle(item.title)
      setIsEditing(false)
    }
  }

  return (
    <div className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
      <input
        type="checkbox"
        checked={item.isCompleted}
        onChange={handleToggle}
        className="mt-1 h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
        disabled={!canManage}
      />
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full px-3 py-1 border border-blue-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            disabled={saving}
          />
        ) : (
          <div className="flex items-start gap-2">
            <span className={`flex-1 text-sm ${item.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {item.title}
            </span>
            {canManage && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </div>
        )}
        {item.isCompleted && item.completer && (
          <div className="ml-6 mt-1 text-xs text-gray-500">
            Completed by {item.completer.displayName || item.completer.username}
            {item.completedAt && (
              <> • {format(new Date(item.completedAt), 'MMM d, yyyy HH:mm')}</>
            )}
          </div>
        )}
      </div>
      {canManage && !isEditing && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5.034 7H11.5a2 2 0 010 4H5a2 2 0 01-2-2V7a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2.5" />
          </svg>
        </button>
      )}
    </div>
  )
}