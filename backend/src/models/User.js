const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  onlineStatus: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

User.associate = (models) => {
  User.hasMany(models.Group, {
    as: 'ownedGroups',
    foreignKey: 'ownerId'
  });
  User.hasMany(models.GroupMember, {
    as: 'groupMemberships',
    foreignKey: 'userId'
  });
  User.belongsToMany(models.Group, {
    as: 'groups',
    through: models.GroupMember,
    foreignKey: 'userId',
    otherKey: 'groupId'
  });
  User.hasMany(models.Task, {
    as: 'createdTasks',
    foreignKey: 'creatorId'
  });
  User.hasMany(models.Task, {
    as: 'assignedTasks',
    foreignKey: 'assigneeId'
  });
  User.hasMany(models.Checklist, {
    as: 'completedChecklists',
    foreignKey: 'completedBy'
  });
  User.belongsToMany(models.Task, {
    as: 'taskAssignments',
    through: models.TaskMember,
    foreignKey: 'userId',
    otherKey: 'taskId'
  });
  User.hasMany(models.Message, {
    as: 'sentMessages',
    foreignKey: 'senderId'
  });
};

module.exports = User;