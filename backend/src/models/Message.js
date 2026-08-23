const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  senderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
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
  taskId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Tasks',
      key: 'id'
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [1, 5000]
    }
  },
  messageType: {
    type: DataTypes.ENUM('message', 'comment', 'system'),
    allowNull: false,
    defaultValue: 'message'
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
      fields: ['groupId']
    },
    {
      fields: ['taskId']
    },
    {
      fields: ['groupId', 'createdAt']
    },
    {
      fields: ['taskId', 'createdAt']
    },
    {
      fields: ['senderId']
    }
  ]
});

Message.associate = (models) => {
  Message.belongsTo(models.User, {
    as: 'sender',
    foreignKey: 'senderId',
    onDelete: 'CASCADE'
  });
  Message.belongsTo(models.Group, {
    as: 'group',
    foreignKey: 'groupId',
    onDelete: 'CASCADE'
  });
  Message.belongsTo(models.Task, {
    as: 'task',
    foreignKey: 'taskId',
    onDelete: 'CASCADE'
  });
  Message.hasMany(models.Notification, {
    as: 'notifications',
    foreignKey: 'messageId',
    onDelete: 'SET NULL'
  });
};

module.exports = Message;