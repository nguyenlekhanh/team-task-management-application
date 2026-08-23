const { Notification, User } = require('../models');

const NOTIFICATION_TYPES = Notification.NOTIFICATION_TYPES;

const PREFERENCE_KEYS = {
  TASK_ASSIGNED: 'taskAssigned',
  TASK_COMPLETED: 'taskCompleted',
  NEW_MESSAGE: 'newMessage',
  DEADLINE_APPROACHING: 'deadlineApproaching',
  MENTION: 'mention'
};

const DEFAULT_PREFERENCES = {
  taskAssigned: true,
  taskCompleted: true,
  newMessage: true,
  deadlineApproaching: true,
  mention: true
};

function extractMentions(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }
  const matches = content.match(/@([a-zA-Z0-9_]+)/g) || [];
  return [...new Set(matches.map(m => m.substring(1)))];
}

function isTypeAllowedForUser(user, type) {
  const prefKey = PREFERENCE_KEYS[type];
  if (!prefKey) {
    return false;
  }
  const prefs = user.notificationPreferences;
  if (!prefs || typeof prefs !== 'object') {
    return DEFAULT_PREFERENCES[prefKey];
  }
  if (typeof prefs[prefKey] !== 'boolean') {
    return DEFAULT_PREFERENCES[prefKey];
  }
  return prefs[prefKey];
}

async function createNotification(data) {
  try {
    return await Notification.create(data);
  } catch (err) {
    console.error('[ERROR] createNotification:', err.message);
    return null;
  }
}

// Creates notifications for a set of recipients:
// - deduplicates recipient IDs
// - excludes the sender
// - skips recipients who disabled this notification type in their preferences
async function notifyUsers({ recipientIds, senderId = null, type, title, message, taskId = null, groupId = null, messageId = null, metadata = null }) {
  const uniqueIds = [...new Set(
    (recipientIds || [])
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0)
  )].filter(id => senderId === null || id !== senderId);

  if (uniqueIds.length === 0) {
    return [];
  }

  let recipients;
  try {
    recipients = await User.findAll({
      where: { id: uniqueIds },
      attributes: ['id', 'notificationPreferences']
    });
  } catch (err) {
    console.error('[ERROR] notifyUsers (load recipients):', err.message);
    return [];
  }

  const created = [];
  for (const recipient of recipients) {
    if (!isTypeAllowedForUser(recipient, type)) {
      continue;
    }
    const notification = await createNotification({
      recipientId: recipient.id,
      senderId,
      taskId,
      groupId,
      messageId,
      type,
      title,
      message,
      isRead: false,
      readAt: null,
      metadata
    });
    if (notification) {
      created.push(notification);
    }
  }
  return created;
}

function sanitizeNotification(notification) {
  return {
    id: notification.id,
    recipientId: notification.recipientId,
    senderId: notification.senderId,
    taskId: notification.taskId,
    groupId: notification.groupId,
    messageId: notification.messageId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    readAt: notification.readAt,
    metadata: notification.metadata || null,
    sender: notification.sender ? {
      id: notification.sender.id,
      username: notification.sender.username,
      displayName: notification.sender.displayName,
      avatarUrl: notification.sender.avatarUrl
    } : null,
    task: notification.task ? {
      id: notification.task.id,
      title: notification.task.title
    } : null,
    group: notification.group ? {
      id: notification.group.id,
      name: notification.group.name
    } : null,
    createdAt: notification.createdAt
  };
}

module.exports = {
  NOTIFICATION_TYPES,
  PREFERENCE_KEYS,
  DEFAULT_PREFERENCES,
  extractMentions,
  isTypeAllowedForUser,
  createNotification,
  notifyUsers,
  sanitizeNotification
};
