const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const taskController = require('../controllers/taskController');

router.use(authenticate);

router.post('/groups/:groupId/tasks', taskController.createTask);
router.get('/groups/:groupId/tasks', taskController.getGroupTasks);
router.get('/tasks', taskController.getMyTasks);
router.get('/tasks/:id', taskController.getTask);
router.put('/tasks/:id', taskController.updateTask);
router.delete('/tasks/:id', taskController.deleteTask);
router.put('/tasks/:id/assign', taskController.assignTask);
router.put('/tasks/:id/status', taskController.updateTaskStatus);

// Checklist routes
router.get('/tasks/:taskId/checklist', taskController.getChecklist);
router.post('/tasks/:taskId/checklist', taskController.addChecklistItem);
router.put('/tasks/:taskId/checklist/:itemId', taskController.updateChecklistItem);
router.delete('/tasks/:taskId/checklist/:itemId', taskController.deleteChecklistItem);
router.put('/tasks/:taskId/checklist/:itemId/toggle', taskController.toggleChecklistItem);

module.exports = router;