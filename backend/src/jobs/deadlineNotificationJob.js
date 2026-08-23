const { Task } = require('../models');
const { Op } = require('sequelize');
const { notifyUsers } = require('../utils/notificationService');

const CHECK_HOUR_UTC = 9;
const DAY_MS = 24 * 60 * 60 * 1000;

// Finds tasks due within the next 24 hours (not completed/overdue) and creates
// DEADLINE_APPROACHING notifications for assignee and creator.
// Deduplicates: skips tasks that already have a DEADLINE_APPROACHING notification
// created within the last 24 hours. Returns the number of notifications created.
async function runDeadlineCheck(now = new Date()) {
  try {
    const windowEnd = new Date(now.getTime() + DAY_MS);

    const tasks = await Task.findAll({
      where: {
        dueDate: { [Op.ne]: null, [Op.lte]: windowEnd, [Op.gt]: now },
        status: { [Op.notIn]: ['completed', 'overdue'] }
      }
    });

    let createdCount = 0;
    for (const task of tasks) {
      const recent = await Task.sequelize.models.Notification.count({
        where: {
          taskId: task.id,
          type: 'DEADLINE_APPROACHING',
          createdAt: { [Op.gt]: new Date(now.getTime() - DAY_MS) }
        }
      });
      if (recent > 0) {
        continue;
      }

      const recipientIds = [task.assigneeId, task.creatorId].filter(id => Number.isInteger(id));
      const created = await notifyUsers({
        recipientIds,
        senderId: null,
        type: 'DEADLINE_APPROACHING',
        title: 'Deadline approaching',
        message: `Task '${task.title}' is due in 24 hours`,
        taskId: task.id,
        groupId: task.groupId,
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          groupId: task.groupId,
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null
        }
      });
      createdCount += created.length;
    }

    if (createdCount > 0) {
      console.log(`[JOB] Deadline check: created ${createdCount} notification(s)`);
    }
    return createdCount;
  } catch (err) {
    console.error('[ERROR] runDeadlineCheck:', err.message);
    return 0;
  }
}

function msUntilNextRun(now = new Date()) {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    CHECK_HOUR_UTC,
    0,
    0,
    0
  ));
  if (next <= now) {
    next.setTime(next.getTime() + DAY_MS);
  }
  return next.getTime() - now.getTime();
}

function startDeadlineNotificationJob() {
  const delay = msUntilNextRun();
  console.log(`[JOB] Deadline notification job scheduled, first run in ${Math.round(delay / 1000 / 60)} minutes`);

  setTimeout(() => {
    runDeadlineCheck();
    setInterval(() => {
      runDeadlineCheck();
    }, DAY_MS);
  }, delay);
}

module.exports = {
  runDeadlineCheck,
  startDeadlineNotificationJob
};
