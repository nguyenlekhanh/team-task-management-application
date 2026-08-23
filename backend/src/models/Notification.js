const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  NEW_MESSAGE: 'NEW_MESSAGE',
  DEADLINE_APPROACHING: 'DEADLINE_APPROACHING',
  MENTION: 'MENTION'
};

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  recipientId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  senderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  taskId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Tasks',
      key: 'id'
    }
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Groups',
      key: 'id'
    }
  },
  messageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Messages',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: {
        args: [Object.values(NOTIFICATION_TYPES)],
        msg: 'Invalid notification type'
      }
    }
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      len: [1, 200]
    }
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [1, 5000]
    }
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    {
      fields: ['recipientId', 'isRead']
    },
    {
      fields: ['recipientId', { name: 'createdAt', order: 'DESC' }]
    },
    {
      fields: ['createdAt']
    },
    {
      fields: ['taskId']
    },
    {
      fields: ['groupId']
    },
    {
      fields: ['type']
    }
  ]
});

Notification.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

Notification.associate = (models) => {
  Notification.belongsTo(models.User, {
    as: 'recipient',
    foreignKey: 'recipientId',
    onDelete: 'CASCADE'
  });
  Notification.belongsTo(models.User, {
    as: 'sender',
    foreignKey: 'senderId',
    onDelete: 'SET NULL'
  });
  Notification.belongsTo(models.Task, {
    as: 'task',
    foreignKey: 'taskId',
    onDelete: 'SET NULL'
  });
  Notification.belongsTo(models.Group, {
    as: 'group',
    foreignKey: 'groupId',
    onDelete: 'CASCADE'
  });
  Notification.belongsTo(models.Message, {
    as: 'sourceMessage',
    foreignKey: 'messageId',
    onDelete: 'SET NULL'
  });
};

module.exports = Notification;
