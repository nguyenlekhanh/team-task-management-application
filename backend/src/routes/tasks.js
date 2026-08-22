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

module.exports = router;