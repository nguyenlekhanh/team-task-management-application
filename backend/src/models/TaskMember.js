const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TaskMember = sequelize.define('TaskMember', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  taskId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Tasks',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  role: {
    type: DataTypes.ENUM('assignee', 'reviewer', 'follower'),
    allowNull: false,
    defaultValue: 'assignee'
  },
  assignedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  assignedBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
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
      unique: true,
      fields: ['taskId', 'userId']
    },
    {
      fields: ['taskId']
    },
    {
      fields: ['userId']
    }
  ]
});

TaskMember.associate = (models) => {
  TaskMember.belongsTo(models.Task, {
    as: 'task',
    foreignKey: 'taskId',
    onDelete: 'CASCADE'
  });
  TaskMember.belongsTo(models.User, {
    as: 'user',
    foreignKey: 'userId',
    onDelete: 'CASCADE'
  });
  TaskMember.belongsTo(models.User, {
    as: 'assigner',
    foreignKey: 'assignedBy',
    onDelete: 'RESTRICT'
  });
};

module.exports = TaskMember;