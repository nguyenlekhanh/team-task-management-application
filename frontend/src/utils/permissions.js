import { useAuth } from '../contexts/AuthContext'

export function useTaskPermissions(task, groupRole) {
  const { user } = useAuth()

  if (!task || !user) {
    return {
      canView: false,
      canEdit: false,
      canDelete: false,
      canAssign: false,
      canUpdateStatus: false,
      canManageChecklist: false,
    }
  }

  const isOwner = groupRole === 'owner'
  const isAdmin = groupRole === 'admin'
  const isCreator = task.creatorId === user.id
  const isAssignee = task.assigneeId === user.id
  const isMember = groupRole === 'member'

  return {
    canView: true, // If they can see the task, they can view it
    canEdit: isOwner || isAdmin || isCreator,
    canDelete: isOwner || isAdmin || isCreator,
    canAssign: isOwner || isAdmin,
    canUpdateStatus: isOwner || isAdmin || isCreator || isAssignee,
    canManageChecklist: true, // All members can manage checklist
  }
}

export function useGroupPermissions(groupRole) {
  const { user } = useAuth()

  if (!user) {
    return {
      canCreateTask: false,
      canManageMembers: false,
      canUpdateGroup: false,
      canDeleteGroup: false,
    }
  }

  const isOwner = groupRole === 'owner'
  const isAdmin = groupRole === 'admin'
  const isMember = groupRole === 'member'

  return {
    canCreateTask: true, // All members can create tasks
    canManageMembers: isOwner || isAdmin,
    canUpdateGroup: isOwner || isAdmin,
    canDeleteGroup: isOwner,
  }
}

export function getStatusColor(status) {
  switch (status) {
    case 'todo':
      return 'bg-gray-100 text-gray-800'
    case 'in_progress':
      return 'bg-blue-100 text-blue-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'overdue':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function getPriorityColor(priority) {
  switch (priority) {
    case 'low':
      return 'bg-gray-100 text-gray-800'
    case 'medium':
      return 'bg-yellow-100 text-yellow-800'
    case 'high':
      return 'bg-orange-100 text-orange-800'
    case 'urgent':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function getRoleColor(role) {
  switch (role) {
    case 'owner':
      return 'bg-purple-100 text-purple-800'
    case 'admin':
      return 'bg-blue-100 text-blue-800'
    case 'member':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}