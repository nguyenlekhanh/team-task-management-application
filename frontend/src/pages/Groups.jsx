import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { groupApi } from '../services/api'
import { Navbar } from '../components/Navbar'

export function Groups() {
  const { isAuthenticated, checkAuth } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    avatarUrl: '',
  })

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    fetchGroups()
  }, [isAuthenticated, navigate])

  const fetchGroups = async () => {
    try {
      const response = await groupApi.list()
      setGroups(response.data.groups)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch groups')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setCreateError('')
  }

  const handleCreateGroup = async (e) => {
    e.preventDefault()
    setCreating(true)
    setCreateError('')

    try {
      const response = await groupApi.create(formData)
      setGroups(prev => [...prev, response.data.group])
      setShowCreateModal(false)
      setFormData({ name: '', description: '', avatarUrl: '' })
      navigate(`/groups/${response.data.group.id}`)
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Failed to create group')
    } finally {
      setCreating(false)
    }
  }

  if (!isAuthenticated) {
    return null
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
      <Navbar
        title="Team Task Management"
        links={[
          { to: '/dashboard', label: 'Dashboard' },
          { to: '/profile', label: 'Profile' },
        ]}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Groups</h2>
            <p className="text-gray-600 mt-1">Manage your groups and collaborations</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Create Group
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded text-sm">
            {error}
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Your Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    No groups yet. Create your first group!
                  </td>
                </tr>
              ) : (
                groups.map(group => (
                  <tr key={group.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link to={`/groups/${group.id}`} className="text-blue-600 hover:text-blue-900 font-medium">
                        {group.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-xs truncate">
                      {group.description || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        group.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                        group.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {group.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link to={`/groups/${group.id}`} className="text-blue-600 hover:text-blue-900 text-sm">
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Create Group Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Create Group</h3>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {createError && (
                  <div className="mb-4 p-3 bg-red-50 text-red-600 rounded text-sm">
                    {createError}
                  </div>
                )}

                <form onSubmit={handleCreateGroup} className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Group Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      maxLength={100}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      maxLength={1000}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="avatarUrl" className="block text-sm font-medium text-gray-700 mb-1">
                      Avatar URL (optional)
                    </label>
                    <input
                      id="avatarUrl"
                      name="avatarUrl"
                      type="url"
                      value={formData.avatarUrl}
                      onChange={handleInputChange}
                      placeholder="https://example.com/avatar.png"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {creating ? 'Creating...' : 'Create Group'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}