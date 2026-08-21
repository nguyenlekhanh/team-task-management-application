const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const GroupMember = sequelize.define('GroupMember', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Groups',
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
    type: DataTypes.ENUM('owner', 'admin', 'member'),
    allowNull: false,
    defaultValue: 'member'
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
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
      fields: ['groupId', 'userId']
    },
    {
      fields: ['groupId']
    },
    {
      fields: ['userId']
    }
  ]
});

GroupMember.associate = (models) => {
  GroupMember.belongsTo(models.Group, {
    as: 'group',
    foreignKey: 'groupId',
    onDelete: 'CASCADE'
  });
  GroupMember.belongsTo(models.User, {
    as: 'user',
    foreignKey: 'userId',
    onDelete: 'CASCADE'
  });
};

module.exports = GroupMember;