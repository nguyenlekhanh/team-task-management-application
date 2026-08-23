const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const messageController = require('../controllers/messageController');

router.use(authenticate);

// Group messages
router.get('/groups/:groupId/messages', messageController.getGroupMessages);
router.post('/groups/:groupId/messages', messageController.addGroupMessage);

// Task comments
router.get('/tasks/:taskId/comments', messageController.getTaskComments);
router.post('/tasks/:taskId/comments', messageController.addTaskComment);

// Message management (edit/delete own messages, owner/admin can delete any)
router.put('/messages/:id', messageController.updateMessage);
router.delete('/messages/:id', messageController.deleteMessage);

module.exports = router;