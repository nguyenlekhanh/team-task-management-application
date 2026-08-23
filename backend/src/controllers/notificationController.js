const { Notification, User, Task, Group, Message } = require('../models');
const { Op } = require('sequelize');
const {
  NOTIFICATION_TYPES,
  PREFERENCE_KEYS,
  DEFAULT_PREFERENCES,
  sanitizeNotification
} = require('../utils/notificationService');

const VALID_TYPES = Object.values(NOTIFICATION_TYPES);

async function getNotifications(req, res) {
  const { page = 1, limit = 20, isRead, type, before } = req.query;

  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Invalid notification type' });
  }

  if (isRead !== undefined && !['true', 'false'].includes(isRead)) {
    return res.status(400).json({ error: 'isRead must be true or false' });
  }

  try {
    const where = { recipientId: req.user.id };
    if (isRead !== undefined) {
      where.isRead = isRead === 'true';
    }
    if (type) {
      where.type = type;
    }
    if (before) {
      const beforeDate = new Date(before);
      if (isNaN(beforeDate.getTime())) {
        return res.status(400).json({ error: 'Invalid before timestamp' });
      }
      where.createdAt = { [Op.lt]: beforeDate };
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Notification.findAndCountAll({
      where,
      include: [
        { model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: Task, as: 'task', attributes: ['id', 'title'] },
        { model: Group, as: 'group', attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset
    });

    res.json({
      items: rows.map(sanitizeNotification),
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
        hasMore: offset + rows.length < count
      }
    });
  } catch (err) {
    console.error('[ERROR] getNotifications:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}

async function getUnreadCount(req, res) {
  try {
    const unreadCount = await Notification.count({
      where: { recipientId: req.user.id, isRead: false }
    });
    res.json({ unreadCount });
  } catch (err) {
    console.error('[ERROR] getUnreadCount:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to fetch unread count' });
  }
}

async function markAsRead(req, res) {
  const notificationId = parseInt(req.params.id, 10);

  if (isNaN(notificationId)) {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  try {
    const notification = await Notification.findOne({
      where: { id: notificationId, recipientId: req.user.id },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'username', 'displayName', 'avatarUrl'] },
        { model: Task, as: 'task', attributes: ['id', 'title'] },
        { model: Group, as: 'group', attributes: ['id', 'name'] }
      ]
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await notification.update({ isRead: true, readAt: new Date() });

    res.json({
      message: 'Notification marked as read',
      item: sanitizeNotification(notification)
    });
  } catch (err) {
    console.error('[ERROR] markAsRead:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}

async function markAllAsRead(req, res) {
  try {
    const [updatedCount] = await Notification.update(
      { isRead: true, readAt: new Date() },
      { where: { recipientId: req.user.id, isRead: false } }
    );

    res.json({
      message: 'All notifications marked as read',
      updatedCount
    });
  } catch (err) {
    console.error('[ERROR] markAllAsRead:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
}

async function deleteNotification(req, res) {
  const notificationId = parseInt(req.params.id, 10);

  if (isNaN(notificationId)) {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  try {
    const notification = await Notification.findOne({
      where: { id: notificationId, recipientId: req.user.id }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await notification.destroy();

    res.json({ message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('[ERROR] deleteNotification:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
}

function sanitizePreferences(prefs) {
  const result = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    if (prefs && typeof prefs[key] === 'boolean') {
      result[key] = prefs[key];
    } else {
      result[key] = DEFAULT_PREFERENCES[key];
    }
  }
  return result;
}

async function getPreferences(req, res) {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'notificationPreferences']
    });

    res.json({ preferences: sanitizePreferences(user.notificationPreferences) });
  } catch (err) {
    console.error('[ERROR] getPreferences:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
}

async function updatePreferences(req, res) {
  const body = req.body || {};

  for (const key of Object.keys(body)) {
    if (!(key in DEFAULT_PREFERENCES)) {
      return res.status(400).json({ error: `Unknown preference key: ${key}` });
    }
    if (typeof body[key] !== 'boolean') {
      return res.status(400).json({ error: `Preference '${key}' must be a boolean` });
    }
  }

  if (Object.keys(body).length === 0) {
    return res.status(400).json({ error: 'No preference fields provided' });
  }

  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'notificationPreferences']
    });

    const merged = { ...sanitizePreferences(user.notificationPreferences), ...body };
    user.notificationPreferences = merged;
    await user.save();

    res.json({
      message: 'Notification preferences updated',
      preferences: sanitizePreferences(user.notificationPreferences)
    });
  } catch (err) {
    console.error('[ERROR] updatePreferences:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to update notification preferences' });
  }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getPreferences,
  updatePreferences
};
