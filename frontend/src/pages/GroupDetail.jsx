import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { groupApi, messageApi } from '../services/api'
import { AddMemberModal } from '../components/AddMemberModal'
import { ChatPanel } from '../components/ChatPanel'
import { Navbar } from '../components/Navbar'

export function GroupDetail() {
  const { id } = useParams()
  const { isAuthenticated, checkAuth, user } = useAuth()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)

  const isOwner = group?.role === 'owner'
  const isAdmin = group?.role === 'admin'
  const canManageMembers = isOwner || isAdmin
  const canUpdateGroup = isOwner || isAdmin
  const canDeleteGroup = isOwner

  const userRole = group?.role || 'member'

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    fetchGroup()
    fetchMembers()
  }, [isAuthenticated, id, navigate])

  const fetchGroup = async () => {
    try {
      const response = await groupApi.get(id)
      setGroup(response.data.group)
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Group not found')
      } else {
        setError(err.response?.data?.error || 'Failed to fetch group')
      }
    }
  }

  const fetchMembers = async () => {
    try {
      const response = await groupApi.getMembers(id)
      setMembers(response.data.members)
    } catch (err) {
      // Error handled by group fetch
    }
  }

  const handleDeleteGroup = async () => {
    if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
      return
    }
    try {
      await groupApi.delete(id)
      navigate('/groups')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete group')
    }
  }

  const handleUpdateGroup = async (e) => {
    e.preventDefault()
    try {
      const response = await groupApi.update(id, {
        name: group.name,
        description: group.description,
        avatarUrl: group.avatarUrl,
      })
      setGroup(response.data.group)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update group')
    }
  }

  const handleRemoveMember = async (userId) => {
    if (!confirm('Are you sure you want to remove this member?')) {
      return
    }
    try {
      await groupApi.removeMember(id, userId)
      await fetchMembers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove member')
    }
  }

  const handleUpdateRole = async (userId, role) => {
    try {
      await groupApi.updateMemberRole(id, userId, { role })
      await fetchMembers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update role')
    }
  }

  const canManageMember = (member) => {
    if (member.userId === user.id) return false
    if (member.role === 'owner') return false
    if (!canManageMembers) return false
    if (isAdmin && member.role === 'admin') return false
    return true
  }

  const canChangeRole = (member) => {
    if (member.userId === user.id) return false
    if (member.role === 'owner') return false
    if (!isOwner) return false
    return true
  }

  const handleAddMemberSuccess = () => {
    setShowAddMemberModal(false)
    fetchMembers()
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

  if (error && !group) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Group Not Found</h2>
          <p className="text-gray-600 mb-8">{error}</p>
          <button
            onClick={() => navigate('/groups')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Back to Groups
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        title="Team Task Management"
        links={[
          { to: '/dashboard', label: 'Dashboard' },
          { to: '/groups', label: 'Groups' },
          { to: `/groups/${id}/tasks`, label: 'Tasks', className: 'bg-purple-600 text-white hover:bg-purple-700' },
          { to: '/profile', label: 'Profile' },
        ]}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded text-sm">
            {error}
          </div>
        )}

        <div className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <Link
                to="/groups"
                className="text-blue-600 hover:text-blue-900 text-sm mb-2 inline-block"
              >
                ← Back to Groups
              </Link>
              <h2 className="text-2xl font-bold text-gray-900 break-words">{group?.name}</h2>
              <p className="text-gray-600 mt-1">{group?.description || 'No description'}</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                group?.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                group?.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {group?.role}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Group Info & Actions - First Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Group Information</h3>
              <dl className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <dt className="text-sm font-medium text-gray-500">Group ID</dt>
                  <dd className="text-sm text-gray-900">{group?.id}</dd>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <dt className="text-sm font-medium text-gray-500">Owner ID</dt>
                  <dd className="text-sm text-gray-900">{group?.ownerId}</dd>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="text-sm text-gray-900">{group?.createdAt ? new Date(group.createdAt).toLocaleString() : 'N/A'}</dd>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <dt className="text-sm font-medium text-gray-500">Updated</dt>
                  <dd className="text-sm text-gray-900">{group?.updatedAt ? new Date(group.updatedAt).toLocaleString() : 'N/A'}</dd>
                </div>
                {group?.avatarUrl && (
                  <div className="grid grid-cols-2 gap-4">
                    <dt className="text-sm font-medium text-gray-500">Avatar</dt>
                    <dd className="text-sm text-gray-900">
                      <img src={group.avatarUrl} alt="Group avatar" className="w-16 h-16 rounded-full object-cover" />
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {canUpdateGroup && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Update Group</h3>
                <form onSubmit={handleUpdateGroup} className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Group Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={group?.name}
                      onChange={(e) => setGroup({ ...group, name: e.target.value })}
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
                      value={group?.description || ''}
                      onChange={(e) => setGroup({ ...group, description: e.target.value })}
                      maxLength={1000}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="avatarUrl" className="block text-sm font-medium text-gray-700 mb-1">
                      Avatar URL
                    </label>
                    <input
                      id="avatarUrl"
                      type="url"
                      value={group?.avatarUrl || ''}
                      onChange={(e) => setGroup({ ...group, avatarUrl: e.target.value })}
                      placeholder="https://example.com/avatar.png"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Save Changes
                  </button>
                </form>
              </div>
            )}

            {canDeleteGroup && (
              <div className="bg-white shadow rounded-lg p-6 border border-red-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 text-red-600">Danger Zone</h3>
                <p className="text-gray-600 mb-4">Once you delete this group, there is no going back. All members will be removed and all group data will be permanently deleted.</p>
                <button
                  onClick={handleDeleteGroup}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Delete Group
                </button>
              </div>
            )}
          </div>

          {/* Members & Chat - Second Column */}
          <div className="lg:col-span-1 space-y-6">
            {/* Chat Panel */}
            <ChatPanel
              groupId={id}
              currentUserId={user.id}
              userRole={userRole}
            />

            {/* Members */}
            <div className="bg-white shadow rounded-lg sticky top-8">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Members ({members.length})</h3>
                {canManageMembers && (
                  <button
                    onClick={() => setShowAddMemberModal(true)}
                    className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    Add Member
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {members.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                          No members yet.
                        </td>
                      </tr>
                    )}
                    {members.map(member => (
                      <tr key={member.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-blue-600 font-medium text-sm">
                                {member.user?.username?.charAt(0).toUpperCase() || 'U'}
                              </span>
                            </div>
                            <div className="ml-3">
                              <p className="text-sm font-medium text-gray-900">{member.user?.username}</p>
                              <p className="text-sm text-gray-500">{member.user?.displayName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            member.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                            member.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {member.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            {canChangeRole(member) && (
                              <select
                                value={member.role}
                                onChange={(e) => handleUpdateRole(member.userId, e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                              </select>
                            )}
                            {canManageMember(member) && (
                              <button
                                onClick={() => handleRemoveMember(member.userId)}
                                className="px-2 py-1 text-red-600 hover:text-red-900 text-sm min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
                              >
                                Remove
                              </button>
                            )}
                            {member.userId === user.id && (
                              <span className="px-2 py-1 text-gray-400 text-sm">You</span>
                            )}
                            {member.role === 'owner' && (
                              <span className="px-2 py-1 text-purple-600 text-sm">Owner</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <AddMemberModal
          isOpen={showAddMemberModal}
          onClose={() => setShowAddMemberModal(false)}
          groupId={id}
          onMemberAdded={fetchMembers}
        />
      </div>
    </div>
  )
}