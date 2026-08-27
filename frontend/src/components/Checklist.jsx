import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { ChecklistItem } from './ChecklistItem'

export function Checklist({ taskId, items, onAdd, onToggle, onUpdate, onDelete, canManage }) {
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      title: '',
    }
  })

  const handleSubmitForm = async (data) => {
    if (!data.title.trim()) return
    setAdding(true)
    setError('')
    try {
      await onAdd({ title: data.title.trim() })
      reset()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add checklist item')
    } finally {
      setAdding(false)
    }
  }

  const completedCount = items.filter(item => item.isCompleted).length
  const totalCount = items.length

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Checklist</h3>
        <div className="flex items-center gap-3">
          {totalCount > 0 && (
            <span className="text-sm text-gray-500">
              Progress: {completedCount} / {totalCount}
              {totalCount > 0 && ` (${Math.round((completedCount / totalCount) * 100)}%)`}
            </span>
          )}
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            + Add Item
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={handleSubmit(handleSubmitForm)} className="mb-4 space-y-2" aria-label="Add checklist item">
          {error && (
            <div className="p-2 bg-red-50 text-red-600 rounded text-sm" role="alert">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <input
              {...register('title', { required: 'Title is required', maxLength: 500 })}
              type="text"
              placeholder="Checklist item title"
              aria-label="Checklist item title"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm min-h-[44px]"
              autoFocus
            />
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); reset(); setError('') }}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {items.length === 0 && !adding && (
        <div className="text-center py-8">
          <p className="text-gray-500">No checklist items yet</p>
          <button
            onClick={() => setAdding(true)}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Add First Item
          </button>
        </div>
      )}

      <div className="space-y-1">
        {items.map(item => (
          <ChecklistItem
            key={item.id}
            item={item}
            onToggle={onToggle}
            onUpdate={onUpdate}
            onDelete={onDelete}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  )
}