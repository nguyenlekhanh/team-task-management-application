const { Task, Group, GroupMember, User, Checklist, TaskMember } = require('../models');
const { Op } = require('sequelize');
const { notifyUsers } = require('../utils/notificationService');

// Date fields must be absent or parseable; rejects garbage objects/values
// that would otherwise persist and render as 'Invalid Date' in the UI (5E.2).
function isValidDateValue(value) {
  if (value === undefined || value === null || value === '') return true;
  return !isNaN(new Date(value).getTime());
}

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

  if (!isValidDateValue(startDate) || !isValidDateValue(dueDate)) {
    return res.status(400).json({ error: 'Invalid start date or due date' });
  }

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
  const { 
    status, 
    priority, 
    assigneeId, 
    creatorId,
    search,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'DESC',
    page = 1, 
    limit = 20 
  } = req.query;

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  try {
    // Check if user is a member of the group
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id }
    });
    console.log('[DEBUG] getGroupTasks - userId:', req.user.id, 'groupId:', groupId, 'membership:', membership ? 'found' : 'not found');

    if (!membership) {
      return res.status(404).json({ error: 'Group not found or access denied' });
    }

    const where = { groupId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeId) where.assigneeId = parseInt(assigneeId, 10);
    if (creatorId) where.creatorId = parseInt(creatorId, 10);
    
    // Search in title and description (case-insensitive)
    if (search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    // Date range filtering
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const validSortFields = ['createdAt', 'updatedAt', 'title', 'status', 'priority', 'dueDate'];
    const validSortOrders = ['ASC', 'DESC'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortOrderDir = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    console.log('[DEBUG] getGroupTasks - where:', JSON.stringify(where), 'sort:', sortField, sortOrderDir, 'page:', pageNum, 'limit:', limitNum);

    const { count, rows } = await Task.findAndCountAll({
      where,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: User, as: 'assignee', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ],
      order: [[sortField, sortOrderDir]],
      limit: limitNum,
      offset
    });
    console.log('[DEBUG] getGroupTasks - count:', count, 'rows:', rows.length);

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
    console.error('[ERROR] getGroupTasks:', err.message, err.stack);
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

  if (!isValidDateValue(startDate) || !isValidDateValue(dueDate)) {
    return res.status(400).json({ error: 'Invalid start date or due date' });
  }

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

module.exports = {
  createTask,
  getGroupTasks,
  getTask,
  updateTask,
  deleteTask,
  assignTask,
  updateTaskStatus,
  getMyTasks,
  getChecklist,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
  sanitizeTask,
  sanitizeTaskList
};

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

async function assignTask(req, res) {
  const taskId = parseInt(req.params.id, 10);
  const { assigneeId } = req.body;

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  if (!assigneeId) {
    return res.status(400).json({ error: 'Assignee ID is required' });
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

    // Authorization: only owner or admin can assign tasks
    const isOwner = membership.role === 'owner';
    const isAdmin = membership.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Only owner or admin can assign tasks' });
    }

    // Validate assignee is a member of the group
    if (assigneeId) {
      const assigneeMembership = await GroupMember.findOne({
        where: { groupId: task.groupId, userId: assigneeId }
      });
      if (!assigneeMembership) {
        return res.status(400).json({ error: 'Assignee must be a member of the group' });
      }
    }

    const updates = { assigneeId: assigneeId || null };
    await task.update(updates);

    // Notification trigger: TASK_ASSIGNED to the new assignee
    if (assigneeId && assigneeId !== req.user.id) {
      await notifyUsers({
        recipientIds: [assigneeId],
        senderId: req.user.id,
        type: 'TASK_ASSIGNED',
        title: 'New task assigned',
        message: `You have been assigned to task '${task.title}' in group '${task.group.name}'`,
        taskId: task.id,
        groupId: task.groupId,
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          groupId: task.groupId,
          groupName: task.group.name,
          assignedBy: req.user.id
        }
      });
    }

    const updatedTask = await Task.findByPk(taskId, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: User, as: 'assignee', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: Checklist, as: 'checklist', order: [['order', 'ASC']] }
      ]
    });

    res.json({
      message: 'Task assigned successfully',
      task: sanitizeTask(task)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to assign task' });
  }
}

async function updateTaskStatus(req, res) {
  const taskId = parseInt(req.params.id, 10);
  const { status } = req.body;

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  const validStatuses = ['todo', 'in_progress', 'completed', 'overdue'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Valid status is required (todo, in_progress, completed, overdue)' });
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

    // Authorization: owner, admin, creator, or assignee can update status
    const isOwner = membership.role === 'owner';
    const isAdmin = membership.role === 'admin';
    const isCreator = task.creatorId === req.user.id;
    const isAssignee = task.assigneeId === req.user.id;

    if (!isOwner && !isAdmin && !isCreator && !isAssignee) {
      return res.status(403).json({ error: 'Only owner, admin, creator, or assignee can update task status' });
    }

    const wasCompleted = task.status === 'completed';
    const updates = { status };
    if (status === 'completed' && task.status !== 'completed') {
      updates.completedAt = new Date();
    } else if (status !== 'completed' && task.status === 'completed') {
      updates.completedAt = null;
    }

    await task.update(updates);

    // Notification trigger: TASK_COMPLETED to creator, assignee and task followers
    if (status === 'completed' && !wasCompleted) {
      const followers = await TaskMember.findAll({
        where: { taskId: task.id, role: 'follower' },
        attributes: ['userId']
      });
      await notifyUsers({
        recipientIds: [
          task.creatorId,
          task.assigneeId,
          ...followers.map(f => f.userId)
        ],
        senderId: req.user.id,
        type: 'TASK_COMPLETED',
        title: 'Task completed',
        message: `'${task.title}' has been marked as completed by ${req.user.displayName}`,
        taskId: task.id,
        groupId: task.groupId,
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          groupId: task.groupId,
          groupName: task.group.name,
          completedBy: req.user.id
        }
      });
    }

    const updatedTask = await Task.findByPk(taskId, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: User, as: 'assignee', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: Checklist, as: 'checklist', order: [['order', 'ASC']] }
      ]
    });

    res.json({
      message: 'Task status updated successfully',
      task: sanitizeTask(task)
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update task status' });
  }
}

async function getMyTasks(req, res) {
  const { 
    status, 
    priority, 
    assigneeId, 
    creatorId,
    search,
    startDate,
    endDate,
    sortBy = 'createdAt',
    sortOrder = 'DESC',
    page = 1, 
    limit = 20 
  } = req.query;

  try {
    // Get all groups the user is a member of
    const memberships = await GroupMember.findAll({
      where: { userId: req.user.id },
      attributes: ['groupId']
    });

    const groupIds = memberships.map(m => m.groupId);

    if (groupIds.length === 0) {
      return res.json({
        tasks: [],
        pagination: { total: 0, page: 1, limit: 20, totalPages: 0 }
      });
    }

    const where = { groupId: { [Op.in]: groupIds } };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assigneeId) where.assigneeId = parseInt(assigneeId, 10);
    if (creatorId) where.creatorId = parseInt(creatorId, 10);
    
    if (search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const validSortFields = ['createdAt', 'updatedAt', 'title', 'status', 'priority', 'dueDate'];
    const validSortOrders = ['ASC', 'DESC'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortOrderDir = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Task.findAndCountAll({
      where,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: User, as: 'assignee', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: Group, as: 'group', attributes: ['id', 'name'] }
      ],
      order: [[sortField, sortOrderDir]],
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
    console.error('[ERROR] getMyTasks:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
}

function sanitizeChecklistItem(item) {
  return {
    id: item.id,
    taskId: item.taskId,
    title: item.title,
    isCompleted: item.isCompleted,
    order: item.order,
    completedBy: item.completedBy,
    completedAt: item.completedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    completer: item.completer ? {
      id: item.completer.id,
      username: item.completer.username,
      displayName: item.completer.displayName,
      avatarUrl: item.completer.avatarUrl
    } : null
  };
}

async function getChecklist(req, res) {
  const taskId = parseInt(req.params.taskId, 10);

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  try {
    const task = await Task.findByPk(taskId);

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

    const items = await Checklist.findAll({
      where: { taskId },
      include: [
        { model: User, as: 'completer', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ],
      order: [['order', 'ASC']]
    });

    res.json({ items: items.map(sanitizeChecklistItem) });
  } catch (err) {
    console.error('[ERROR] getChecklist:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to fetch checklist' });
  }
}

async function addChecklistItem(req, res) {
  const taskId = parseInt(req.params.taskId, 10);
  const { title, order } = req.body;

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Checklist item title is required' });
  }

  if (title.length > 500) {
    return res.status(400).json({ error: 'Checklist item title must be 500 characters or less' });
  }

  if (order !== undefined && (typeof order !== 'number' || order < 0 || !Number.isInteger(order))) {
    return res.status(400).json({ error: 'Order must be a non-negative integer' });
  }

  try {
    const task = await Task.findByPk(taskId);

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

    // Determine order if not provided (append to end)
    let itemOrder = order;
    if (itemOrder === undefined) {
      const maxOrderItem = await Checklist.findOne({
        where: { taskId },
        order: [['order', 'DESC']]
      });
      itemOrder = maxOrderItem ? maxOrderItem.order + 1 : 0;
    }

    const item = await Checklist.create({
      taskId,
      title: title.trim(),
      isCompleted: false,
      order: itemOrder,
      completedBy: null,
      completedAt: null
    });

    const createdItem = await Checklist.findByPk(item.id, {
      include: [
        { model: User, as: 'completer', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ]
    });

    res.status(201).json({
      message: 'Checklist item created successfully',
      item: sanitizeChecklistItem(createdItem)
    });
  } catch (err) {
    console.error('[ERROR] addChecklistItem:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to create checklist item' });
  }
}

async function updateChecklistItem(req, res) {
  const taskId = parseInt(req.params.taskId, 10);
  const itemId = parseInt(req.params.itemId, 10);
  const { title, order } = req.body;

  if (isNaN(taskId) || isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid task ID or item ID' });
  }

  if (title !== undefined) {
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Checklist item title is required' });
    }
    if (title.length > 500) {
      return res.status(400).json({ error: 'Checklist item title must be 500 characters or less' });
    }
  }

  if (order !== undefined && (typeof order !== 'number' || order < 0 || !Number.isInteger(order))) {
    return res.status(400).json({ error: 'Order must be a non-negative integer' });
  }

  try {
    const item = await Checklist.findOne({
      where: { id: itemId, taskId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }

    // Check if user is a member of the task's group
    const task = await Task.findByPk(taskId);
    const membership = await GroupMember.findOne({
      where: { groupId: task.groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (order !== undefined) updates.order = order;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    await item.update(updates);

    const updatedItem = await Checklist.findByPk(itemId, {
      include: [
        { model: User, as: 'completer', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ]
    });

    res.json({
      message: 'Checklist item updated successfully',
      item: sanitizeChecklistItem(updatedItem)
    });
  } catch (err) {
    console.error('[ERROR] updateChecklistItem:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to update checklist item' });
  }
}

async function deleteChecklistItem(req, res) {
  const taskId = parseInt(req.params.taskId, 10);
  const itemId = parseInt(req.params.itemId, 10);

  if (isNaN(taskId) || isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid task ID or item ID' });
  }

  try {
    const item = await Checklist.findOne({
      where: { id: itemId, taskId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }

    // Check if user is a member of the task's group
    const task = await Task.findByPk(taskId);
    const membership = await GroupMember.findOne({
      where: { groupId: task.groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    await item.destroy();

    res.json({ message: 'Checklist item deleted successfully' });
  } catch (err) {
    console.error('[ERROR] deleteChecklistItem:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to delete checklist item' });
  }
}

async function toggleChecklistItem(req, res) {
  const taskId = parseInt(req.params.taskId, 10);
  const itemId = parseInt(req.params.itemId, 10);
  const { isCompleted } = req.body;

  if (isNaN(taskId) || isNaN(itemId)) {
    return res.status(400).json({ error: 'Invalid task ID or item ID' });
  }

  if (typeof isCompleted !== 'boolean') {
    return res.status(400).json({ error: 'isCompleted (boolean) is required' });
  }

  try {
    const item = await Checklist.findOne({
      where: { id: itemId, taskId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }

    // Check if user is a member of the task's group
    const task = await Task.findByPk(taskId);
    const membership = await GroupMember.findOne({
      where: { groupId: task.groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    const updates = { isCompleted };
    if (isCompleted && !item.isCompleted) {
      updates.completedBy = req.user.id;
      updates.completedAt = new Date();
    } else if (!isCompleted && item.isCompleted) {
      updates.completedBy = null;
      updates.completedAt = null;
    }

    await item.update(updates);

    const updatedItem = await Checklist.findByPk(itemId, {
      include: [
        { model: User, as: 'completer', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ]
    });

    res.json({
      message: 'Checklist item updated successfully',
      item: sanitizeChecklistItem(updatedItem)
    });
  } catch (err) {
    console.error('[ERROR] toggleChecklistItem:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to update checklist item' });
  }
}

module.exports = {
  createTask,
  getGroupTasks,
  getTask,
  updateTask,
  deleteTask,
  assignTask,
  updateTaskStatus,
  getMyTasks,
  getChecklist,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
  sanitizeTask,
  sanitizeTaskList
};