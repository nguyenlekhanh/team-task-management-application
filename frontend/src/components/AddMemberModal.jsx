import { useState, FormEvent } from 'react'
import { groupApi } from '../services/api'

export function AddMemberModal({ 
  isOpen, 
  onClose, 
  groupId, 
  onMemberAdded 
}) {
  const [addingMember, setAddingMember] = useState(false)
  const [error, setError] = useState('')
  const [newMember, setNewMember] = useState({
    userId: '',
    role: 'member',
  })

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setAddingMember(true)
    setError('')

    try {
      await groupApi.addMember(groupId, newMember)
      onMemberAdded()
      setNewMember({ userId: '', role: 'member' })
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add member')
    } finally {
      setAddingMember(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Add Member</h3>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-1">
                User ID
              </label>
              <input
                id="userId"
                name="userId"
                type="number"
                value={newMember.userId}
                onChange={(e) => setNewMember({ ...newMember, userId: e.target.value })}
                required
                min={1}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                id="role"
                name="role"
                value={newMember.role}
                onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingMember}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {addingMember ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}