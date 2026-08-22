const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Checklist = sequelize.define('Checklist', {
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
  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
    validate: {
      len: [1, 500]
    }
  },
  isCompleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  completedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
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
      fields: ['taskId']
    },
    {
      fields: ['taskId', 'order']
    }
  ]
});

Checklist.associate = (models) => {
  Checklist.belongsTo(models.Task, {
    as: 'task',
    foreignKey: 'taskId',
    onDelete: 'CASCADE'
  });
  Checklist.belongsTo(models.User, {
    as: 'completer',
    foreignKey: 'completedBy',
    onDelete: 'SET NULL'
  });
};

module.exports = Checklist;