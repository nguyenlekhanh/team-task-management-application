const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Task = sequelize.define('Task', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      len: [1, 200]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  creatorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  assigneeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Groups',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('todo', 'in_progress', 'completed', 'overdue'),
    allowNull: false,
    defaultValue: 'todo'
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    allowNull: false,
    defaultValue: 'medium'
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
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
      fields: ['groupId']
    },
    {
      fields: ['assigneeId']
    },
    {
      fields: ['creatorId']
    },
    {
      fields: ['groupId', 'status']
    },
    {
      fields: ['assigneeId', 'status']
    }
  ]
});

Task.associate = (models) => {
  Task.belongsTo(models.User, {
    as: 'creator',
    foreignKey: 'creatorId',
    onDelete: 'RESTRICT'
  });
  Task.belongsTo(models.User, {
    as: 'assignee',
    foreignKey: 'assigneeId',
    onDelete: 'SET NULL'
  });
  Task.belongsTo(models.Group, {
    as: 'group',
    foreignKey: 'groupId',
    onDelete: 'CASCADE'
  });
  Task.hasMany(models.Checklist, {
    as: 'checklist',
    foreignKey: 'taskId',
    onDelete: 'CASCADE'
  });
  Task.hasMany(models.Message, {
    as: 'comments',
    foreignKey: 'taskId',
    onDelete: 'CASCADE'
  });
  Task.belongsToMany(models.User, {
    as: 'assignees',
    through: models.TaskMember,
    foreignKey: 'taskId',
    otherKey: 'userId'
  });
};

module.exports = Task;