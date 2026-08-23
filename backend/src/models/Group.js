const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Group = sequelize.define('Group', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    validate: {
      len: [0, 1000]
    }
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  ownerId: {
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
      fields: ['ownerId']
    }
  ]
});

Group.associate = (models) => {
  Group.belongsTo(models.User, {
    as: 'owner',
    foreignKey: 'ownerId'
  });
  Group.hasMany(models.GroupMember, {
    as: 'members',
    foreignKey: 'groupId',
    onDelete: 'CASCADE'
  });
  Group.hasMany(models.Task, {
    as: 'tasks',
    foreignKey: 'groupId',
    onDelete: 'CASCADE'
  });
  Group.hasMany(models.Message, {
    as: 'messages',
    foreignKey: 'groupId',
    onDelete: 'CASCADE'
  });
};

module.exports = Group;