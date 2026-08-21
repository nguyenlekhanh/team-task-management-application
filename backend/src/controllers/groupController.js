const Group = require('../models/Group');
const GroupMember = require('../models/GroupMember');
const User = require('../models/User');

Group.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
Group.hasMany(GroupMember, { as: 'members', foreignKey: 'groupId', onDelete: 'CASCADE' });
GroupMember.belongsTo(Group, { as: 'group', foreignKey: 'groupId', onDelete: 'CASCADE' });
GroupMember.belongsTo(User, { as: 'user', foreignKey: 'userId', onDelete: 'CASCADE' });
User.hasMany(Group, { as: 'ownedGroups', foreignKey: 'ownerId' });
User.hasMany(GroupMember, { as: 'groupMemberships', foreignKey: 'userId' });
User.belongsToMany(Group, { as: 'groups', through: GroupMember, foreignKey: 'userId', otherKey: 'groupId' });

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

    await group.destroy();

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
  sanitizeGroupMember
};