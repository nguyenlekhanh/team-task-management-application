const { Message, Group, GroupMember, User, Task, TaskMember } = require('../models');
const { Op } = require('sequelize');
const { notifyUsers, extractMentions } = require('../utils/notificationService');

function sanitizeMessage(message) {
  return {
    id: message.id,
    senderId: message.senderId,
    groupId: message.groupId,
    taskId: message.taskId,
    content: message.content,
    messageType: message.messageType,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    sender: message.sender ? {
      id: message.sender.id,
      username: message.sender.username,
      displayName: message.sender.displayName,
      avatarUrl: message.sender.avatarUrl
    } : null
  };
}

async function getGroupMessages(req, res) {
  const groupId = parseInt(req.params.groupId, 10);
  const { 
    page = 1, 
    limit = 50, 
    before 
  } = req.query;

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

    const where = { groupId, messageType: 'message' };
    if (before) {
      where.createdAt = { [Op.lt]: new Date(before) };
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Message.findAndCountAll({
      where,
      include: [
        { model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset
    });

    res.json({
      items: rows.map(sanitizeMessage),
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
        hasMore: offset + rows.length < count
      }
    });
  } catch (err) {
    console.error('[ERROR] getGroupMessages:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

async function addGroupMessage(req, res) {
  const groupId = parseInt(req.params.groupId, 10);
  const { content } = req.body;

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  if (content.length > 5000) {
    return res.status(400).json({ error: 'Message content must be 5000 characters or less' });
  }

  try {
    // Check if user is a member of the group
    const membership = await GroupMember.findOne({
      where: { groupId, userId: req.user.id }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Group not found or access denied' });
    }

    const message = await Message.create({
      senderId: req.user.id,
      groupId,
      content: content.trim(),
      messageType: 'message'
    });

    const createdMessage = await Message.findByPk(message.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ]
    });

    // Notification triggers for group messages (failures are logged, not thrown)
    try {
      const group = await Group.findByPk(groupId, { attributes: ['id', 'name'] });
      if (!group) {
        throw new Error('Group not found for notification trigger');
      }
      const members = await GroupMember.findAll({
        where: { groupId },
        attributes: ['userId']
      });
      const memberIds = members.map(m => m.userId);
      const mentionedUsernames = extractMentions(content.trim());
      let mentionedIds = [];
      if (mentionedUsernames.length > 0) {
        const mentionedUsers = await User.findAll({
          where: { username: { [Op.in]: mentionedUsernames } },
          attributes: ['id']
        });
        const memberSet = new Set(memberIds);
        mentionedIds = mentionedUsers.map(u => u.id).filter(id => memberSet.has(id));
        await notifyUsers({
          recipientIds: mentionedIds,
          senderId: req.user.id,
          type: 'MENTION',
          title: 'You were mentioned',
          message: `${req.user.displayName} mentioned you in ${group.name}`,
          groupId,
          messageId: message.id,
          metadata: {
            groupId,
            groupName: group.name,
            messageId: message.id,
            senderId: req.user.id,
            senderName: req.user.displayName
          }
        });
      }
      // NEW_MESSAGE to remaining members (mentioned users get MENTION instead)
      const newMessageRecipients = memberIds.filter(id => !mentionedIds.includes(id));
      await notifyUsers({
        recipientIds: newMessageRecipients,
        senderId: req.user.id,
        type: 'NEW_MESSAGE',
        title: `New message in ${group.name}`,
        message: `${req.user.displayName}: ${content.trim().substring(0, 100)}`,
        groupId,
        messageId: message.id,
        metadata: {
          groupId,
          groupName: group.name,
          messageId: message.id,
          senderId: req.user.id,
          senderName: req.user.displayName
        }
      });
    } catch (notifyErr) {
      console.error('[ERROR] addGroupMessage notification trigger:', notifyErr.message);
    }

    res.status(201).json({
      message: 'Message sent successfully',
      item: sanitizeMessage(createdMessage)
    });
  } catch (err) {
    console.error('[ERROR] addGroupMessage:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}

async function getTaskComments(req, res) {
  const taskId = parseInt(req.params.taskId, 10);
  const { 
    page = 1, 
    limit = 50, 
    before 
  } = req.query;

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

    const where = { taskId, messageType: 'comment' };
    if (before) {
      where.createdAt = { [Op.lt]: new Date(before) };
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Message.findAndCountAll({
      where,
      include: [
        { model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ],
      order: [['createdAt', 'ASC']],
      limit: limitNum,
      offset
    });

    res.json({
      items: rows.map(sanitizeMessage),
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
        hasMore: offset + rows.length < count
      }
    });
  } catch (err) {
    console.error('[ERROR] getTaskComments:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to fetch comments' });
  }
}

async function addTaskComment(req, res) {
  const taskId = parseInt(req.params.taskId, 10);
  const { content } = req.body;

  if (isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task ID' });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  if (content.length > 5000) {
    return res.status(400).json({ error: 'Comment content must be 5000 characters or less' });
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

    const message = await Message.create({
      senderId: req.user.id,
      taskId,
      content: content.trim(),
      messageType: 'comment'
    });

    const createdMessage = await Message.findByPk(message.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ]
    });

    // Notification triggers for task comments (failures are logged, not thrown)
    try {
      const group = await Group.findByPk(task.groupId, { attributes: ['id', 'name'] });
      if (!group) {
        throw new Error('Group not found for notification trigger');
      }
      const followers = await TaskMember.findAll({
        where: { taskId: task.id, role: 'follower' },
        attributes: ['userId']
      });
      const stakeholderIds = [
        task.creatorId,
        task.assigneeId,
        ...followers.map(f => f.userId)
      ].filter(id => Number.isInteger(id));

      const mentionedUsernames = extractMentions(content.trim());
      let mentionedIds = [];
      if (mentionedUsernames.length > 0) {
        const mentionedUsers = await User.findAll({
          where: { username: { [Op.in]: mentionedUsernames } },
          attributes: ['id']
        });
        const memberCheck = await GroupMember.findAll({
          where: { groupId: task.groupId, userId: { [Op.in]: mentionedUsers.map(u => u.id) } },
          attributes: ['userId']
        });
        const memberSet = new Set(memberCheck.map(m => m.userId));
        mentionedIds = mentionedUsers.map(u => u.id).filter(id => memberSet.has(id));
        await notifyUsers({
          recipientIds: mentionedIds,
          senderId: req.user.id,
          type: 'MENTION',
          title: 'You were mentioned',
          message: `${req.user.displayName} mentioned you in ${group.name}`,
          taskId: task.id,
          groupId: task.groupId,
          messageId: message.id,
          metadata: {
            taskId: task.id,
            groupId: task.groupId,
            groupName: group.name,
            messageId: message.id,
            senderId: req.user.id,
            senderName: req.user.displayName
          }
        });
      }
      // NEW_MESSAGE with task context to remaining stakeholders (mentioned users get MENTION instead)
      const newMessageRecipients = stakeholderIds.filter(id => !mentionedIds.includes(id));
      await notifyUsers({
        recipientIds: newMessageRecipients,
        senderId: req.user.id,
        type: 'NEW_MESSAGE',
        title: `New comment on ${task.title}`,
        message: `${req.user.displayName} commented: ${content.trim().substring(0, 100)}`,
        taskId: task.id,
        groupId: task.groupId,
        messageId: message.id,
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          groupId: task.groupId,
          groupName: group.name,
          messageId: message.id,
          senderId: req.user.id,
          senderName: req.user.displayName
        }
      });
    } catch (notifyErr) {
      console.error('[ERROR] addTaskComment notification trigger:', notifyErr.message);
    }

    res.status(201).json({
      message: 'Comment added successfully',
      item: sanitizeMessage(createdMessage)
    });
  } catch (err) {
    console.error('[ERROR] addTaskComment:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to add comment' });
  }
}

async function updateMessage(req, res) {
  const messageId = parseInt(req.params.id, 10);
  const { content } = req.body;

  if (isNaN(messageId)) {
    return res.status(400).json({ error: 'Invalid message ID' });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  if (content.length > 5000) {
    return res.status(400).json({ error: 'Message content must be 5000 characters or less' });
  }

  try {
    const message = await Message.findByPk(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user is the sender
    if (message.senderId !== req.user.id) {
      return res.status(403).json({ error: 'Only the sender can edit this message' });
    }

    // For group messages, verify group membership
    if (message.groupId) {
      const membership = await GroupMember.findOne({
        where: { groupId: message.groupId, userId: req.user.id }
      });
      if (!membership) {
        return res.status(404).json({ error: 'Message not found or access denied' });
      }
    }

    // For task comments, verify group membership
    if (message.taskId) {
      const task = await Task.findByPk(message.taskId);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      const membership = await GroupMember.findOne({
        where: { groupId: task.groupId, userId: req.user.id }
      });
      if (!membership) {
        return res.status(404).json({ error: 'Message not found or access denied' });
      }
    }

    message.content = content.trim();
    await message.save();

    const updatedMessage = await Message.findByPk(messageId, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }
      ]
    });

    res.json({
      message: 'Message updated successfully',
      item: sanitizeMessage(updatedMessage)
    });
  } catch (err) {
    console.error('[ERROR] updateMessage:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to update message' });
  }
}

async function deleteMessage(req, res) {
  const messageId = parseInt(req.params.id, 10);

  if (isNaN(messageId)) {
    return res.status(400).json({ error: 'Invalid message ID' });
  }

  try {
    const message = await Message.findByPk(messageId, {
      include: [
        { model: Group, as: 'group' },
        { model: Task, as: 'task', include: [{ model: Group, as: 'group' }] }
      ]
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check authorization: sender, or group owner/admin
    const isSender = message.senderId === req.user.id;
    let isGroupOwnerOrAdmin = false;

    if (message.groupId) {
      const membership = await GroupMember.findOne({
        where: { groupId: message.groupId, userId: req.user.id }
      });
      if (membership) {
        isGroupOwnerOrAdmin = membership.role === 'owner' || membership.role === 'admin';
      }
    } else if (message.taskId) {
      // For task comments, check group membership
      const task = await Task.findByPk(message.taskId, {
        include: [{ model: Group, as: 'group' }]
      });
      if (task && task.group) {
        const membership = await GroupMember.findOne({
          where: { groupId: task.group.id, userId: req.user.id }
        });
        if (membership) {
          isGroupOwnerOrAdmin = membership.role === 'owner' || membership.role === 'admin';
        }
      }
    }

    if (!isSender && !isGroupOwnerOrAdmin) {
      return res.status(403).json({ error: 'Only the sender, group owner, or admin can delete this message' });
    }

    await message.destroy();

    res.json({ message: 'Message deleted successfully' });
  } catch (err) {
    console.error('[ERROR] deleteMessage:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
}

module.exports = {
  getGroupMessages,
  addGroupMessage,
  getTaskComments,
  addTaskComment,
  updateMessage,
  deleteMessage,
  sanitizeMessage
};