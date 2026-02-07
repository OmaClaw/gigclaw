import { tasks } from '../routes/tasks';
import { triggerWebhook } from '../routes/webhooks';

// Task expiration checker
const TASK_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour

export function startTaskExpiryChecker() {
  console.log('🦞 Task expiry checker started');
  
  setInterval(() => {
    checkExpiredTasks();
  }, CHECK_INTERVAL_MS);
  
  // Run immediately on start
  checkExpiredTasks();
}

function checkExpiredTasks() {
  const now = Date.now();
  let expiredCount = 0;
  
  tasks.forEach((task, taskId) => {
    // Check if task is posted and past deadline
    if (task.status === 'posted' && task.deadline) {
      const deadlineMs = new Date(task.deadline).getTime();
      if (now > deadlineMs) {
        // Mark as expired
        task.status = 'expired';
        expiredCount++;
        
        // Trigger webhook
        triggerWebhook('task.cancelled', {
          taskId,
          reason: 'deadline_expired',
          posterId: task.posterId
        });
        
        console.log(`Task ${taskId.slice(0, 8)} expired (deadline passed)`);
      }
    }
    
    // Check if task is stale (posted too long with no bids)
    if (task.status === 'posted' && !task.deadline) {
      const ageMs = now - task.createdAt;
      if (ageMs > TASK_EXPIRY_MS) {
        task.status = 'expired';
        expiredCount++;
        
        triggerWebhook('task.cancelled', {
          taskId,
          reason: 'stale_no_bids',
          posterId: task.posterId
        });
        
        console.log(`Task ${taskId.slice(0, 8)} expired (stale, no bids)`);
      }
    }
  });
  
  if (expiredCount > 0) {
    console.log(`Expired ${expiredCount} task(s)`);
  }
}

// Cleanup old expired tasks (keep last 30 days)
export function cleanupOldTasks() {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let cleanedCount = 0;
  
  tasks.forEach((task, taskId) => {
    if (task.status === 'expired' || task.status === 'verified') {
      const lastActivity = task.completedAt || task.createdAt;
      if (now - lastActivity > THIRTY_DAYS_MS) {
        tasks.delete(taskId);
        cleanedCount++;
      }
    }
  });
  
  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} old task(s)`);
  }
}
