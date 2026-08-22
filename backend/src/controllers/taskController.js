const { Task, Group, GroupMember, User, Checklist } = require('../models');
const { Op } = require('sequelize');

function sanitizeTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    groupId: task.groupId,
    status: task.status,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    creator: task.creator ? {
      id: task.creator.id,
      username: task.creator.username,
      displayName: task.creator.displayName,
      avatarUrl: task.creator.avatarUrl
    } : null,
    assignee: task.assignee ? {
      id: task.assignee.id,
      username: task.assignee.username,
      displayName: task.assignee.displayName,
      avatarUrl: task.assignee.avatarUrl
    } : null,
    group: task.group ? {
      id: task.group.id,
      name: task.group.name
    } : null,
    checklist: task.checklist ? task.checklist.map(item => ({
      id: item.id,
      taskId: item.taskId,
      title: item.title,
      isCompleted: item.isCompleted,
      order: item.order,
      completedBy: item.completedBy,
      completedAt: item.completedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    })) : []
  };
}

function sanitizeTaskList(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    groupId: task.groupId,
    status: task.status,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    creator: task.creator ? {
      id: task.creator.id,
      username: task.creator.username,
      displayName: task.creator.displayName,
      avatarUrl: task.creator.avatarUrl
    } : null,
    assignee: task.assignee ? {
      id: task.assignee.id,
      username: task.assignee.username,
      displayName: task.assignee.displayName,
      avatarUrl: task.assignee.avatarUrl
    } : null
  };
}

async function createTask(req, res) {
  const { title, description, assigneeId, priority, startDate, dueDate } = req.body;
  const groupId = parseInt(req.params.groupId, 10);

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  if (title.length > 200) {
    return res.status(400).json({ error: 'Task title must be 200 characters or less' });
  }

  if (description && description.length > 5000) {
    return res.status(400).json({ error: 'Description must be 5000 characters or less' });
  }

  const validStatuses = ['todo', 'in_progress', 'completed', 'overdue'];
  const validPriorities = ['low', 'medium', 'high', 'urgent'];

  if (priority && !validPriorities.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority value' });
  }

  try {
    // Check if group exists and user is a member
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Group not found or access denied' });
    }

    // Validate assignee if provided
    if (assigneeId) {
      const assigneeMembership = await GroupMember.findOne({
        where: { groupId, userId: assigneeId }
      });
      if (!assigneeMembership) {
        return res.status(400).json({ error: 'Assignee must be a member of the group' });
      }
    }

    const task = await Task.create({
      title: title.trim(),
      description: description?.trim() || null,
      creatorId: req.user.id,
      assigneeId: assigneeId || null,
      groupId,
      priority: priority || 'medium',
      startDate: startDate || null,
      dueDate: dueDate || null,
      status: 'todo'
    });

    const createdTask = await Task.findByPk(task.id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: User, as: 'assignee', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ]
    });

    res.status(201).json({
      message: 'Task created successfully',
      task: sanitizeTask(createdTask)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create task' });
  }
}

async function getGroupTasks(req, res) {
  const groupId = parseInt(req.params.groupId, 10);
  const { status, priority, assigneeId, page = 1, limit = 20 } = req.query;

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  try {
    // Check if user is a member of the group
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Group not found or access denied' });
    }

    const where = { groupId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeId) where.assigneeId = parseInt(assigneeId, 10);

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Task.findAndCountAll({
      where,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: User, as: 'assignee', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset
    });

    res.json({
      tasks: rows.map(sanitizeTaskList),
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
}

async function getTask(req, res) {
  const taskId = parseInt(req.params.id, 10);

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  try {
    const task = await Task.findByPk(taskId, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: User, as: 'assignee', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: Group, as: 'group', attributes: ['id', 'name'] },
        { model: Checklist, as: 'checklist', order: [['order', 'ASC']] }
      ]
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user is a member of the task's group
    const membership = await GroupMember.findOne({
      where: { groupId: task.groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    res.json({ task: sanitizeTask(task) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch task' });
  }
}

async function updateTask(req, res) {
  const taskId = parseInt(req.params.id, 10);
  const { title, description, assigneeId, priority, status, startDate, dueDate } = req.body;

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  const validStatuses = ['todo', 'in_progress', 'completed', 'overdue'];
  const validPriorities = ['low', 'medium', 'high', 'urgent'];

  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  if (priority && !validPriorities.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority value' });
  }

  if (title && title.length > 200) {
    return res.status(400).json({ error: 'Task title must be 200 characters or less' });
  }

  if (description && description.length > 5000) {
    return res.status(400).json({ error: 'Description must be 5000 characters or less' });
  }

  try {
    const task = await Task.findByPk(taskId, {
      include: [
        { model: Group, as: 'group', include: [{ model: GroupMember, as: 'members' }] }
      ]
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user is a member of the task's group
    const membership = await GroupMember.findOne({
      where: { groupId: task.groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    // Authorization checks
    const isOwner = membership.role === 'owner';
    const isAdmin = membership.role === 'admin';
    const isCreator = task.creatorId === req.user.id;
    const isAssignee = task.assigneeId === req.user.id;

    // Owner, admin, creator, or assignee can update
    if (!isOwner && !isAdmin && !isCreator && !isAssignee) {
      return res.status(403).json({ error: 'Only owner, admin, creator, or assignee can update this task' });
    }

    // Validate assignee if provided
    if (assigneeId !== undefined) {
      if (assigneeId) {
        const assigneeMembership = await GroupMember.findOne({
          where: { groupId: task.groupId, userId: assigneeId }
        });
        if (!assigneeMembership) {
          return res.status(400).json({ error: 'Assignee must be a member of the group' });
        }
      }
    }

    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (assigneeId !== undefined) updates.assigneeId = assigneeId || null;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) {
      updates.status = status;
      // Auto-set completedAt when status changes to 'completed'
      if (status === 'completed' && task.status !== 'completed') {
        updates.completedAt = new Date();
      } else if (status !== 'completed' && task.status === 'completed') {
        updates.completedAt = null;
      }
    }
    if (startDate !== undefined) updates.startDate = startDate || null;
    if (dueDate !== undefined) updates.dueDate = dueDate || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await task.update(updates);

    const updatedTask = await Task.findByPk(taskId, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: User, as: 'assignee', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: Checklist, as: 'checklist', order: [['order', 'ASC']] }
      ]
    });

    res.json({
      message: 'Task updated successfully',
      task: sanitizeTask(updatedTask)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update task' });
  }
}

async function deleteTask(req, res) {
  const taskId = parseInt(req.params.id, 10);

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  try {
    const task = await Task.findByPk(taskId, {
      include: [{ model: Group, as: 'group' }]
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user is a member of the task's group
    const membership = await GroupMember.findOne({
      where: { groupId: task.groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    // Authorization: owner, admin, or creator can delete
    const isOwner = membership.role === 'owner';
    const isAdmin = membership.role === 'admin';
    const isCreator = task.creatorId === req.user.id;

    if (!isOwner && !isAdmin && !isCreator) {
      return res.status(403).json({ error: 'Only owner, admin, or creator can delete this task' });
    }

    // Admin cannot delete owner's tasks
    if (isAdmin && task.group.ownerId === task.creatorId) {
      return res.status(403).json({ error: 'Admin cannot delete tasks created by group owner' });
    }

    await task.destroy();

    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete task' });
  }
}

module.exports = {
  createTask,
  getGroupTasks,
  getTask,
  updateTask,
  deleteTask,
  sanitizeTask,
  sanitizeTaskList
};