const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const groupController = require('../controllers/groupController');

router.use(authenticate);

router.post('/', groupController.createGroup);
router.get('/', groupController.getUserGroups);
router.get('/:id', groupController.getGroup);
router.put('/:id', groupController.updateGroup);
router.delete('/:id', groupController.deleteGroup);

router.get('/:id/members', groupController.getGroupMembers);
router.post('/:id/members', groupController.addMember);
router.delete('/:id/members/:userId', groupController.removeMember);
router.put('/:id/members/:userId', groupController.updateMemberRole);

module.exports = router;