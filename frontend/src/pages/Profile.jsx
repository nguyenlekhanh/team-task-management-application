import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { userApi } from '../services/api'
import { NotificationSettings } from '../components/NotificationSettings'
import { Navbar } from '../components/Navbar'

export function Profile() {
  const { user, logout, isAuthenticated, checkAuth } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState('profile')

  const [formData, setFormData] = useState({
    displayName: '',
    avatarUrl: '',
    onlineStatus: false
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    loadProfile()
  }, [isAuthenticated, navigate])

  const loadProfile = async () => {
    try {
      const response = await userApi.getProfile()
      const userData = response.data.user
      setProfile(userData)
      setFormData({
        displayName: userData.displayName || '',
        avatarUrl: userData.avatarUrl || '',
        onlineStatus: userData.onlineStatus || false
      })
    } catch (err) {
      setError('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    setError('')
    setSuccess('')
  }

  const handlePasswordChange = (e) => {
    const { name, value } = e.target
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }))
    setError('')
    setSuccess('')
  }

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await userApi.updateProfile(formData)
      await checkAuth()
      setSuccess('Profile updated successfully')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setChangingPassword(true)
    setError('')
    setSuccess('')

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match')
      setChangingPassword(false)
      return
    }

    try {
      await userApi.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      })
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setSuccess('Password changed successfully')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
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
      <Navbar title="Team Task Management" onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Profile Settings</h2>
          <p className="text-gray-600 mt-1">Manage your account settings</p>
        </div>

        <div className="max-w-2xl">
          <div className="bg-white shadow rounded-lg">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'profile'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Profile
                </button>
                <button
                  onClick={() => setActiveTab('password')}
                  className={`py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'password'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Change Password
                </button>
                <button
                  onClick={() => setActiveTab('notifications')}
                  className={`py-4 px-6 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'notifications'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Notifications
                </button>
              </nav>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 rounded text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 p-3 bg-green-50 text-green-600 rounded text-sm">
                  {success}
                </div>
              )}

              {activeTab === 'notifications' && <NotificationSettings />}

              {activeTab === 'profile' && (
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                      Username (cannot be changed)
                    </label>
                    <input
                      id="username"
                      type="text"
                      value={profile?.username || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                      Display Name
                    </label>
                    <input
                      id="displayName"
                      name="displayName"
                      type="text"
                      value={formData.displayName}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="avatarUrl" className="block text-sm font-medium text-gray-700 mb-1">
                      Avatar URL
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

                  <div className="flex items-center">
                    <input
                      id="onlineStatus"
                      name="onlineStatus"
                      type="checkbox"
                      checked={formData.onlineStatus}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="onlineStatus" className="ml-2 block text-sm text-gray-700">
                      Show as online
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Profile'}
                  </button>
                </form>
              )}

              {activeTab === 'password' && (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                      Current Password
                    </label>
                    <input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={handlePasswordChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                      New Password (min 6 characters)
                    </label>
                    <input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      value={passwordData.newPassword}
                      onChange={handlePasswordChange}
                      required
                      minLength={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={handlePasswordChange}
                      required
                      minLength={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {changingPassword ? 'Changing...' : 'Change Password'}
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="mt-6 bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
            <dl className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <dt className="text-sm font-medium text-gray-500">User ID</dt>
                <dd className="text-sm text-gray-900">{profile?.id}</dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <dt className="text-sm font-medium text-gray-500">Username</dt>
                <dd className="text-sm text-gray-900">{profile?.username}</dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <dt className="text-sm font-medium text-gray-500">Created At</dt>
                <dd className="text-sm text-gray-900">{profile?.createdAt ? new Date(profile.createdAt).toLocaleString() : 'N/A'}</dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                <dd className="text-sm text-gray-900">{profile?.updatedAt ? new Date(profile.updatedAt).toLocaleString() : 'N/A'}</dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    </div>
  )
}