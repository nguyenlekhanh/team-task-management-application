const { Group, GroupMember, User, Task } = require('../models');
const { Op } = require('sequelize');

// Productivity stats (7.2) derive overdue/dueSoon the same way the task UI
// does (6.6/7.1): overdue/dueSoon are display derivations from dueDate, not
// stored statuses; 'completed' tasks are never overdue or due soon.
function computeGroupStats(tasks, now = Date.now()) {
  const stats = {
    total: tasks.length,
    todo: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    dueSoon: 0,
    unassigned: 0,
    completionRate: 0
  };

  for (const task of tasks) {
    if (task.status === 'completed') {
      stats.completed++;
    } else if (task.status === 'in_progress') {
      stats.inProgress++;
    } else {
      stats.todo++;
    }

    if (task.status !== 'completed') {
      if (task.dueDate) {
        const due = new Date(task.dueDate).getTime();
        if (!isNaN(due)) {
          if (due < now) stats.overdue++;
          else if (due - now <= 24 * 60 * 60 * 1000) stats.dueSoon++;
        }
      }
      if (!task.assigneeId) stats.unassigned++;
    }
  }

  stats.completionRate = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;
  return stats;
}

function sanitizeGroup(group) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    avatarUrl: group.avatarUrl,
    ownerId: group.ownerId,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt
  };
}

function sanitizeGroupMember(member) {
  return {
    id: member.id,
    groupId: member.groupId,
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt,
    user: member.user ? {
      id: member.user.id,
      username: member.user.username,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl
    } : null
  };
}

async function createGroup(req, res) {
  const { name, description, avatarUrl } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Group name is required' });
  }

  if (name.length > 100) {
    return res.status(400).json({ error: 'Group name must be 100 characters or less' });
  }

  if (description && description.length > 1000) {
    return res.status(400).json({ error: 'Description must be 1000 characters or less' });
  }

  try {
    const group = await Group.create({
      name: name.trim(),
      description: description?.trim() || null,
      avatarUrl: avatarUrl || null,
      ownerId: req.user.id
    });

    await GroupMember.create({
      groupId: group.id,
      userId: req.user.id,
      role: 'owner'
    });

    const createdGroup = await Group.findByPk(group.id, {
      include: [{
        model: User,
        as: 'owner',
        attributes: ['id', 'username', 'displayName', 'avatarUrl']
      }]
    });

    res.status(201).json({
      message: 'Group created successfully',
      group: sanitizeGroup(createdGroup)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create group' });
  }
}

async function getUserGroups(req, res) {
  try {
    const memberships = await GroupMember.findAll({
      where: { userId: req.user.id },
      include: [{
        model: Group,
        as: 'group',
        include: [{
          model: User,
          as: 'owner',
          attributes: ['id', 'username', 'displayName', 'avatarUrl']
        }]
      }],
      order: [['joinedAt', 'DESC']]
    });

    const groups = memberships.map(m => ({
      ...sanitizeGroup(m.group),
      role: m.role,
      joinedAt: m.joinedAt
    }));

    // Team productivity detail (7.2): optional additive stats. Computed only
    // when requested via ?include=stats; without the param the response is
    // unchanged for existing consumers. Stats aggregate ONLY over the groups
    // the user is a member of (the list above is already membership-scoped),
    // via a single attributes-only query - no per-group fan-out.
    if (req.query.include === 'stats') {
      const groupIds = memberships.map(m => m.groupId);
      const tasks = await Task.findAll({
        where: { groupId: { [Op.in]: groupIds } },
        attributes: ['groupId', 'status', 'dueDate', 'assigneeId']
      });
      const byGroup = new Map();
      for (const task of tasks) {
        const list = byGroup.get(task.groupId) || [];
        list.push(task);
        byGroup.set(task.groupId, list);
      }
      for (const group of groups) {
        group.stats = computeGroupStats(byGroup.get(group.id) || []);
      }
    }

    res.json({ groups });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch groups' });
  }
}

async function getGroup(req, res) {
  const { id } = req.params;
  const groupId = parseInt(id, 10);

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  try {
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id },
      include: [{
        model: Group,
        as: 'group',
        include: [{
          model: User,
          as: 'owner',
          attributes: ['id', 'username', 'displayName', 'avatarUrl']
        }]
      }]
    });

    if (!membership) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({
      group: {
        ...sanitizeGroup(membership.group),
        role: membership.role,
        joinedAt: membership.joinedAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch group' });
  }
}

async function updateGroup(req, res) {
  const { id } = req.params;
  const { name, description, avatarUrl } = req.body;
  const groupId = parseInt(id, 10);

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  try {
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return res.status(403).json({ error: 'Only owner or admin can update group' });
    }

    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const updates = {};
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Group name cannot be empty' });
      }
      if (name.length > 100) {
        return res.status(400).json({ error: 'Group name must be 100 characters or less' });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      if (description && description.length > 1000) {
        return res.status(400).json({ error: 'Description must be 1000 characters or less' });
      }
      updates.description = description?.trim() || null;
    }
    if (avatarUrl !== undefined) {
      updates.avatarUrl = avatarUrl || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await group.update(updates);

    const updatedGroup = await Group.findByPk(groupId, {
      include: [{
        model: User,
        as: 'owner',
        attributes: ['id', 'username', 'displayName', 'avatarUrl']
      }]
    });

    res.json({
      message: 'Group updated successfully',
      group: sanitizeGroup(updatedGroup)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update group' });
  }
}

async function deleteGroup(req, res) {
  const { id } = req.params;
  const groupId = parseInt(id, 10);

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  try {
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (membership.role !== 'owner') {
      return res.status(403).json({ error: 'Only owner can delete group' });
    }

    const group = await Group.findByPk(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const members = await GroupMember.findAll({ where: { groupId }, attributes: ['userId'] });
    await group.destroy();

    // Realtime room eviction (5D.5): every member's sockets leave the deleted
    // group's room. Best-effort; database deletion is authoritative.
    try {
      const presence = require('../socket/presence');
      for (const m of members) {
        presence.evictUserFromGroup(m.userId, groupId);
      }
    } catch (evictErr) {
      console.error('[ERROR] group deletion room eviction:', evictErr.message);
    }

    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete group' });
  }
}

async function getGroupMembers(req, res) {
  const { id } = req.params;
  const groupId = parseInt(id, 10);

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  try {
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const members = await GroupMember.findAll({
      where: { groupId },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'displayName', 'avatarUrl']
      }],
      order: [['role', 'DESC'], ['joinedAt', 'ASC']]
    });

    res.json({
      members: members.map(sanitizeGroupMember)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch members' });
  }
}

async function addMember(req, res) {
  const { id } = req.params;
  const { userId, role } = req.body;
  const groupId = parseInt(id, 10);

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  if (role && !['owner', 'admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return res.status(403).json({ error: 'Only owner or admin can add members' });
    }

    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingMember = await GroupMember.findOne({
      where: { groupId, userId }
    });

    if (existingMember) {
      return res.status(409).json({ error: 'User is already a member of this group' });
    }

    const newMember = await GroupMember.create({
      groupId,
      userId,
      role: role || 'member'
    });

    const memberWithUser = await GroupMember.findByPk(newMember.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'displayName', 'avatarUrl']
      }]
    });

    res.status(201).json({
      message: 'Member added successfully',
      member: sanitizeGroupMember(memberWithUser)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to add member' });
  }
}

async function removeMember(req, res) {
  const { id, userId } = req.params;
  const groupId = parseInt(id, 10);
  const targetUserId = parseInt(userId, 10);

  if (isNaN(groupId) || isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Invalid group ID or user ID' });
  }

  try {
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return res.status(403).json({ error: 'Only owner or admin can remove members' });
    }

    const targetMember = await GroupMember.findOne({
      where: { groupId, userId: targetUserId }
    });

    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (targetMember.role === 'owner') {
      return res.status(403).json({ error: 'Cannot remove owner' });
    }

    if (membership.role === 'admin' && targetMember.role === 'admin') {
      return res.status(403).json({ error: 'Admin cannot remove another admin' });
    }

    if (targetMember.userId === req.user.id) {
      return res.status(403).json({ error: 'Cannot remove yourself' });
    }

    await targetMember.destroy();

    // Realtime room eviction (5D.5): the removed member's connected sockets
    // must leave the group room across all their tabs/devices. Best-effort -
    // membership removal itself is already authoritative in the database.
    try {
      const presence = require('../socket/presence');
      const evicted = presence.evictUserFromGroup(targetUserId, groupId);
      if (evicted > 0) {
        console.log(`[SOCKET] evicted ${evicted} socket(s) of user #${targetUserId} from group #${groupId}`);
      }
    } catch (evictErr) {
      console.error('[ERROR] member room eviction:', evictErr.message);
    }

    res.json({ message: 'Member removed successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove member' });
  }
}

async function updateMemberRole(req, res) {
  const { id, userId } = req.params;
  const { role } = req.body;
  const groupId = parseInt(id, 10);
  const targetUserId = parseInt(userId, 10);

  if (isNaN(groupId) || isNaN(targetUserId)) {
    return res.status(400).json({ error: 'Invalid group ID or user ID' });
  }

  if (!role || !['owner', 'admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Valid role is required' });
  }

  try {
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (membership.role !== 'owner') {
      return res.status(403).json({ error: 'Only owner can change roles' });
    }

    const targetMember = await GroupMember.findOne({
      where: { groupId, userId: targetUserId }
    });

    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (targetMember.role === 'owner') {
      return res.status(403).json({ error: 'Cannot change owner role' });
    }

    if (role === 'owner') {
      return res.status(403).json({ error: 'Cannot assign owner role' });
    }

    await targetMember.update({ role });

    const updatedMember = await GroupMember.findByPk(targetMember.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'displayName', 'avatarUrl']
      }]
    });

    res.json({
      message: 'Member role updated successfully',
      member: sanitizeGroupMember(updatedMember)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update member role' });
  }
}

module.exports = {
  createGroup,
  getUserGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  getGroupMembers,
  addMember,
  removeMember,
  updateMemberRole,
  sanitizeGroup,
  sanitizeGroupMember,
  computeGroupStats
};