const bcrypt = require('bcryptjs');
const User = require('../models/User');

const SALT_ROUNDS = 10;

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    onlineStatus: user.onlineStatus,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function getProfile(req, res) {
  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({
      user: sanitizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch profile'
    });
  }
}

async function updateProfile(req, res) {
  const { displayName, avatarUrl, onlineStatus } = req.body;
  
  const allowedFields = {};
  if (displayName !== undefined) allowedFields.displayName = displayName;
  if (avatarUrl !== undefined) allowedFields.avatarUrl = avatarUrl;
  if (onlineStatus !== undefined) allowedFields.onlineStatus = onlineStatus;

  if (Object.keys(allowedFields).length === 0) {
    return res.status(400).json({
      error: 'No valid fields to update. Allowed: displayName, avatarUrl, onlineStatus'
    });
  }

  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    await user.update(allowedFields);

    res.json({
      message: 'Profile updated successfully',
      user: sanitizeUser(user)
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to update profile'
    });
  }
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: 'Both currentPassword and newPassword are required'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      error: 'New password must be at least 6 characters long'
    });
  }

  try {
    const user = await User.findByPk(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Current password is incorrect'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    
    await user.update({ password: hashedPassword });

    res.json({
      message: 'Password changed successfully'
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to change password'
    });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  sanitizeUser
};