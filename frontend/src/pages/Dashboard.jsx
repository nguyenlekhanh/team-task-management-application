import { Fragment, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { healthApi, taskApi, groupApi, notificationApi, getApiErrorMessage } from '../services/api'
import { isTaskOverdue } from '../utils/taskDisplay'
import { getRoleColor } from '../utils/permissions'
import { TaskStatusBadge } from '../components/TaskStatusBadge'
import { NotificationBell } from '../components/NotificationBell'

export function Dashboard() {
  const { user, logout, isAuthenticated, checkAuth } = useAuth()
  const navigate = useNavigate()
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [overview, setOverview] = useState(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState('')

  // Per-member workload drill-down (7.3): one group expanded at a time,
  // fetched once per expansion and cached for the page lifetime (read-only
  // mount-time view, consistent with the 7.1/7.2 overview posture).
  const [expandedGroupId, setExpandedGroupId] = useState(null)
  const [memberWorkload, setMemberWorkload] = useState({}) // { [groupId]: { loading, error, members, unassigned } }

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    const fetchHealth = async () => {
      try {
        const response = await healthApi.check()
        setHealth(response.data)
      } catch {
        setError('Failed to fetch backend health status')
      } finally {
        setLoading(false)
      }
    }

    const fetchOverview = async () => {
      setOverviewLoading(true)
      setOverviewError('')
      try {
        const [assignedRes, createdRes, notifRes, unreadRes, groupsRes] = await Promise.allSettled([
          taskApi.getMyTasks({ scope: 'assigned', limit: 100 }),
          taskApi.getMyTasks({ scope: 'created', limit: 5, sortBy: 'updatedAt', sortOrder: 'DESC' }),
          notificationApi.list({ limit: 5 }),
          notificationApi.unreadCount(),
          groupApi.list({ include: 'stats' }),
        ])
        const assignedTasks = assignedRes.status === 'fulfilled' ? (assignedRes.value.data.tasks || []) : []
        const assignedTotal = assignedRes.status === 'fulfilled' ? (assignedRes.value.data.pagination?.total ?? assignedTasks.length) : 0
        const createdTasks = createdRes.status === 'fulfilled' ? (createdRes.value.data.tasks || []) : []
        const createdTotal = createdRes.status === 'fulfilled' ? (createdRes.value.data.pagination?.total ?? createdTasks.length) : 0
        const notifications = notifRes.status === 'fulfilled' ? (notifRes.value.data.items || []) : []
        const unreadCount = unreadRes.status === 'fulfilled' ? (unreadRes.value.data.unreadCount ?? 0) : 0
        const groups = groupsRes.status === 'fulfilled' ? (groupsRes.value.data.groups || groupsRes.value.data || []) : []

        const overdueCount = assignedTasks.filter(isTaskOverdue).length
        const dueSoonCount = assignedTasks.filter(t => {
          if (!t.dueDate || t.status === 'completed') return false
          const diff = new Date(t.dueDate) - new Date()
          return diff > 0 && diff <= 24 * 60 * 60 * 1000
        }).length
        const recentTasks = [...assignedTasks].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5)

        const hasAnyFailure = [assignedRes, createdRes, notifRes, unreadRes, groupsRes].some(r => r.status === 'rejected')
        if (hasAnyFailure && assignedTasks.length === 0 && notifications.length === 0 && groups.length === 0) {
          throw new Error('Failed to load overview')
        }

        setOverview({ assignedTasks, assignedTotal, createdTasks, createdTotal, notifications, unreadCount, groups, overdueCount, dueSoonCount, recentTasks })
      } catch (err) {
        setOverviewError(getApiErrorMessage(err, 'Failed to load overview'))
      } finally {
        setOverviewLoading(false)
      }
    }

    fetchHealth()
    fetchOverview()
  }, [isAuthenticated, navigate])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // 7.3 drill-down toggle: expanding fetches member workload (cached);
  // collapsing just closes. Errors retry by toggling again (cache cleared).
  const toggleMemberWorkload = async (groupId) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null)
      return
    }
    setExpandedGroupId(groupId)
    if (memberWorkload[groupId]?.members) return
    setMemberWorkload(prev => ({ ...prev, [groupId]: { loading: true, error: '', members: null, unassigned: null } }))
    try {
      const response = await groupApi.getMembers(groupId, { include: 'stats' })
      setMemberWorkload(prev => ({
        ...prev,
        [groupId]: {
          loading: false,
          error: '',
          members: response.data.members || [],
          unassigned: response.data.unassigned || null
        }
      }))
    } catch (err) {
      setMemberWorkload(prev => ({
        ...prev,
        [groupId]: {
          loading: false,
          error: getApiErrorMessage(err, 'Failed to load member workload'),
          members: null,
          unassigned: null
        }
      }))
    }
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Team Task Management</h1>
            </div>
            <div className="flex items-center space-x-4">
              <NotificationBell />
              <span className="text-sm text-gray-700">
                Logged in as <strong>{user?.displayName || user?.username}</strong>
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-600 mt-1">Welcome back, {user?.displayName || user?.username}!</p>
        </div>

        {/* Productivity Overview — read-only, derived from existing APIs */}
        {overviewLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" role="status" aria-label="Loading overview">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white shadow rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        ) : overviewError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex justify-between items-center" role="alert">
            <p className="text-sm text-red-700">{overviewError}</p>
            <button
              onClick={() => window.location.reload()}
              className="ml-4 px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm min-h-[36px]"
            >
              Retry
            </button>
          </div>
        ) : overview ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Link to="/tasks" className="bg-white shadow rounded-lg p-4 hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <p className="text-sm font-medium text-gray-500">Assigned to me</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{overview.assignedTotal}</p>
                {overview.overdueCount > 0 && (
                  <p className="text-xs text-red-600 mt-1" aria-label={`${overview.overdueCount} overdue`}>{overview.overdueCount} overdue</p>
                )}
              </Link>
              <Link to="/tasks" className="bg-white shadow rounded-lg p-4 hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <p className="text-sm font-medium text-gray-500">Due Soon (24h)</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{overview.dueSoonCount}</p>
                <p className="text-xs text-gray-500 mt-1">from assigned tasks</p>
              </Link>
              <Link to="/tasks" className="bg-white shadow rounded-lg p-4 hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <p className="text-sm font-medium text-gray-500">Created by me</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{overview.createdTotal}</p>
                <p className="text-xs text-gray-500 mt-1">open tasks</p>
              </Link>
              <div className="bg-white shadow rounded-lg p-4">
                <p className="text-sm font-medium text-gray-500">Unread Notifications</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{overview.unreadCount}</p>
                <Link to="/profile" className="text-xs text-blue-600 hover:text-blue-800">Manage preferences →</Link>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Recent Tasks</h3>
                  <Link to="/tasks" className="text-sm text-blue-600 hover:text-blue-800">View all →</Link>
                </div>
                {overview.recentTasks.length === 0 ? (
                  <p className="text-sm text-gray-500">No recent tasks.</p>
                ) : (
                  <ul className="space-y-3">
                    {overview.recentTasks.map(task => (
                      <li key={task.id} className="flex justify-between items-center">
                        <Link to={`/groups/${task.groupId}/tasks/${task.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-900 truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                          {task.title}
                        </Link>
                        <span className="ml-2 flex items-center gap-2">
                          <TaskStatusBadge status={task.status} />
                          {isTaskOverdue(task) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700" aria-label="Overdue">Overdue</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Recent Notifications</h3>
                  <span className="text-xs text-gray-500">{overview.unreadCount} unread</span>
                </div>
                {overview.notifications.length === 0 ? (
                  <p className="text-sm text-gray-500">No notifications.</p>
                ) : (
                  <ul className="space-y-2">
                    {overview.notifications.map(n => (
                      <li key={n.id} className={`text-sm p-2 rounded ${!n.isRead ? 'bg-blue-50 font-medium' : ''}`}>
                        <p className="truncate text-gray-900">{n.title}</p>
                        <p className="text-xs text-gray-500 truncate">{n.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-gray-900">Team Productivity by Group</h3>
                <Link to="/groups" className="text-sm text-blue-600 hover:text-blue-800">View all groups →</Link>
              </div>
              {overview.groups.length === 0 ? (
                <p className="text-sm text-gray-500">You are not a member of any group yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th scope="col" className="px-3 py-2 w-8"><span className="sr-only">Expand member workload</span></th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Group</th>
                        <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                        <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">To Do</th>
                        <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">In Progress</th>
                        <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Completed</th>
                        <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Overdue</th>
                        <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Due Soon</th>
                        <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Unassigned</th>
                        <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Completion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {overview.groups.map(g => {
                        const stats = g.stats || {}
                        const total = stats.total ?? '—'
                        const rate = stats.completionRate ?? null
                        const expanded = expandedGroupId === g.id
                        const workload = memberWorkload[g.id]
                        return (
                          <Fragment key={g.id}>
                          <tr className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => toggleMemberWorkload(g.id)}
                                aria-expanded={expanded}
                                aria-controls={`member-workload-${g.id}`}
                                aria-label={expanded ? `Hide member workload for ${g.name}` : `Show member workload for ${g.name}`}
                                className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                              </button>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <Link to={`/groups/${g.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                                  {g.name}
                                </Link>
                                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getRoleColor(g.role)}`}>
                                  {g.role}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center text-sm text-gray-900">{total}</td>
                            <td className="px-3 py-2 text-center text-sm text-gray-900">{stats.todo ?? '—'}</td>
                            <td className="px-3 py-2 text-center text-sm text-blue-700">{stats.inProgress ?? '—'}</td>
                            <td className="px-3 py-2 text-center text-sm text-green-700">{stats.completed ?? '—'}</td>
                            <td className={`px-3 py-2 text-center text-sm ${stats.overdue > 0 ? 'text-red-600 font-semibold' : 'text-gray-900'}`}>
                              {stats.overdue ?? '—'}
                            </td>
                            <td className={`px-3 py-2 text-center text-sm ${stats.dueSoon > 0 ? 'text-orange-600 font-semibold' : 'text-gray-900'}`}>
                              {stats.dueSoon ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-center text-sm text-gray-900">{stats.unassigned ?? '—'}</td>
                            <td className="px-3 py-2">
                              {rate === null ? (
                                <span className="text-sm text-gray-400">—</span>
                              ) : (
                                <div className="flex items-center gap-2 min-w-[120px]">
                                  <div
                                    className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden"
                                    role="progressbar"
                                    aria-valuenow={rate}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-label={`${g.name} completion ${rate}%`}
                                  >
                                    <div className={`h-full rounded-full ${rate === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${rate}%` }}></div>
                                  </div>
                                  <span className="text-xs text-gray-500 tabular-nums w-9 text-right">{rate}%</span>
                                </div>
                              )}
                            </td>
                          </tr>
                          {expanded && (
                            <tr id={`member-workload-${g.id}`}>
                              <td colSpan={10} className="px-3 py-3 bg-gray-50">
                                <div className="pl-4">
                                  <p className="text-sm font-semibold text-gray-700 mb-2">Member workload — {g.name}</p>
                                  {workload?.loading ? (
                                    <div className="flex justify-center py-4" role="status" aria-label="Loading member workload">
                                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                    </div>
                                  ) : workload?.error ? (
                                    <div className="mb-2 p-2 bg-red-50 text-red-600 rounded text-sm flex justify-between items-center gap-3" role="alert">
                                      <span>{workload.error}</span>
                                      <button
                                        type="button"
                                        onClick={() => { setMemberWorkload(prev => ({ ...prev, [g.id]: undefined })); toggleMemberWorkload(g.id) }}
                                        className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm min-h-[36px]"
                                      >
                                        Retry
                                      </button>
                                    </div>
                                  ) : workload?.members ? (
                                    <div className="overflow-x-auto">
                                      <table className="min-w-full divide-y divide-gray-200">
                                        <thead>
                                          <tr>
                                            <th scope="col" className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Member</th>
                                            <th scope="col" className="px-3 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                                            <th scope="col" className="px-3 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">To Do</th>
                                            <th scope="col" className="px-3 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">In Progress</th>
                                            <th scope="col" className="px-3 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Completed</th>
                                            <th scope="col" className="px-3 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Overdue</th>
                                            <th scope="col" className="px-3 py-1.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Due Soon</th>
                                            <th scope="col" className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Completion</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                          {workload.members.length === 0 && (
                                            <tr><td colSpan={8} className="px-3 py-3 text-sm text-gray-500">No members.</td></tr>
                                          )}
                                          {workload.members.map(m => {
                                            const ms = m.stats || {}
                                            const mrate = ms.completionRate ?? null
                                            const mName = m.user?.displayName || m.user?.username || `User #${m.userId}`
                                            return (
                                              <tr key={m.id} className="hover:bg-gray-50">
                                                <td className="px-3 py-1.5 whitespace-nowrap">
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-900">{mName}</span>
                                                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getRoleColor(m.role)}`}>
                                                      {m.role}
                                                    </span>
                                                  </div>
                                                </td>
                                                <td className="px-3 py-1.5 text-center text-sm text-gray-900">{ms.total ?? '—'}</td>
                                                <td className="px-3 py-1.5 text-center text-sm text-gray-900">{ms.todo ?? '—'}</td>
                                                <td className="px-3 py-1.5 text-center text-sm text-blue-700">{ms.inProgress ?? '—'}</td>
                                                <td className="px-3 py-1.5 text-center text-sm text-green-700">{ms.completed ?? '—'}</td>
                                                <td className={`px-3 py-1.5 text-center text-sm ${ms.overdue > 0 ? 'text-red-600 font-semibold' : 'text-gray-900'}`}>{ms.overdue ?? '—'}</td>
                                                <td className={`px-3 py-1.5 text-center text-sm ${ms.dueSoon > 0 ? 'text-orange-600 font-semibold' : 'text-gray-900'}`}>{ms.dueSoon ?? '—'}</td>
                                                <td className="px-3 py-1.5">
                                                  {mrate === null ? (
                                                    <span className="text-sm text-gray-400">—</span>
                                                  ) : (
                                                    <div className="flex items-center gap-2 min-w-[100px]">
                                                      <div
                                                        className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"
                                                        role="progressbar"
                                                        aria-valuenow={mrate}
                                                        aria-valuemin={0}
                                                        aria-valuemax={100}
                                                        aria-label={`${mName} in ${g.name} completion ${mrate}%`}
                                                      >
                                                        <div className={`h-full rounded-full ${mrate === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${mrate}%` }}></div>
                                                      </div>
                                                      <span className="text-xs text-gray-500 tabular-nums w-9 text-right">{mrate}%</span>
                                                    </div>
                                                  )}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                          {workload.unassigned && (workload.unassigned.total ?? 0) > 0 && (
                                            <tr className="bg-gray-50">
                                              <td className="px-3 py-1.5 whitespace-nowrap">
                                                <span className="text-sm text-gray-600 italic">Unassigned tasks</span>
                                              </td>
                                              <td className="px-3 py-1.5 text-center text-sm text-gray-600">{workload.unassigned.total ?? '—'}</td>
                                              <td className="px-3 py-1.5 text-center text-sm text-gray-600">{workload.unassigned.todo ?? '—'}</td>
                                              <td className="px-3 py-1.5 text-center text-sm text-gray-600">{workload.unassigned.inProgress ?? '—'}</td>
                                              <td className="px-3 py-1.5 text-center text-sm text-gray-600">{workload.unassigned.completed ?? '—'}</td>
                                              <td className={`px-3 py-1.5 text-center text-sm ${workload.unassigned.overdue > 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{workload.unassigned.overdue ?? '—'}</td>
                                              <td className={`px-3 py-1.5 text-center text-sm ${workload.unassigned.dueSoon > 0 ? 'text-orange-600 font-semibold' : 'text-gray-600'}`}>{workload.unassigned.dueSoon ?? '—'}</td>
                                              <td className="px-3 py-1.5">
                                                <span className="text-xs text-gray-500">{workload.unassigned.completionRate ?? '—'}%</span>
                                              </td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">User Information</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Username</dt>
                <dd className="text-sm text-gray-900">{user?.username}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Display Name</dt>
                <dd className="text-sm text-gray-900">{user?.displayName}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">User ID</dt>
                <dd className="text-sm text-gray-900">{user?.id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Created At</dt>
                <dd className="text-sm text-gray-900">{user?.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A'}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Backend Health Status</h3>
            {loading ? (
              <p className="text-gray-600">Loading...</p>
            ) : error ? (
              <p className="text-red-600">{error}</p>
            ) : health ? (
              <dl className="space-y-3">
                <div className="flex items-center">
                  <span className={`w-3 h-3 rounded-full ${health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <dt className="ml-2 text-sm font-medium text-gray-500">Status</dt>
                  <dd className="ml-auto text-sm text-gray-900 capitalize">{health.status}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Timestamp</dt>
                  <dd className="text-sm text-gray-900">{health.timestamp ? new Date(health.timestamp).toLocaleString() : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Message</dt>
                  <dd className="text-sm text-gray-900">{health.message}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-gray-600">No health data available</p>
            )}
          </div>
        </div>

        <div className="mt-8 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="flex space-x-4">
            <Link to="/dashboard" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
              Refresh Dashboard
            </Link>
            <Link to="/groups" className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm">
              Groups
            </Link>
            <Link to="/tasks" className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm">
              My Tasks
            </Link>
            <Link to="/profile" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm">
              Profile Settings
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}