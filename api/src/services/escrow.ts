import { tasks } from '../routes/tasks';
import logger, { logPaymentReleased } from '../utils/logger';
import { wsService } from './websocket';

/**
 * Auto-escrow release service
 * Automatically releases payment to agent when task is verified
 */

interface EscrowReleaseConfig {
  enabled: boolean;
  delayMs: number; // Delay before auto-release (for dispute window)
  minAmount: number;
  maxAmount: number;
}

const config: EscrowReleaseConfig = {
  enabled: process.env.AUTO_ESCROW_ENABLED !== 'false',
  delayMs: parseInt(process.env.AUTO_ESCROW_DELAY_MS || '0'), // 0 = immediate
  minAmount: 0.1, // Minimum 0.1 USDC
  maxAmount: 10000, // Maximum 10,000 USDC
};

/**
 * Schedule auto-release of escrow for a task
 */
export function scheduleEscrowRelease(taskId: string): void {
  if (!config.enabled) {
    logger.info('Auto-escrow disabled, skipping release', { taskId });
    return;
  }

  const task = tasks.get(taskId);
  if (!task) {
    logger.error('Task not found for escrow release', { taskId });
    return;
  }

  // Validate amount
  if (
    task.acceptedBid?.amount < config.minAmount ||
    task.acceptedBid?.amount > config.maxAmount
  ) {
    logger.warn('Escrow amount outside auto-release bounds', {
      taskId,
      amount: task.acceptedBid?.amount,
      min: config.minAmount,
      max: config.maxAmount,
    });
    return;
  }

  logger.info('Scheduling escrow release', {
    taskId,
    agentId: task.assignedAgent,
    amount: task.acceptedBid?.amount,
    delayMs: config.delayMs,
  });

  // Schedule the release
  setTimeout(() => {
    executeEscrowRelease(taskId);
  }, config.delayMs);
}

/**
 * Execute the escrow release
 */
async function executeEscrowRelease(taskId: string): Promise<void> {
  try {
    const task = tasks.get(taskId);
    if (!task) {
      logger.error('Task not found during escrow release', { taskId });
      return;
    }

    // Check if task is still verified (not disputed)
    if (task.status !== 'verified') {
      logger.info('Escrow release cancelled - task status changed', {
        taskId,
        status: task.status,
      });
      return;
    }

    // Check if payment already released
    if (task.paymentReleased) {
      logger.info('Payment already released', { taskId });
      return;
    }

    // Check if there's an active dispute
    if (task.disputeId) {
      logger.info('Escrow release blocked - active dispute', {
        taskId,
        disputeId: task.disputeId,
      });
      return;
    }

    // Execute the payment
    const payment = {
      taskId,
      agentId: task.assignedAgent,
      amount: task.acceptedBid?.amount || 0,
      currency: task.currency || 'USDC',
      releasedAt: Date.now(),
      transactionHash: generateTransactionHash(),
      autoReleased: true,
    };

    // Mark task as paid
    task.paymentReleased = true;
    task.paymentReleasedAt = payment.releasedAt;
    task.paymentTransactionHash = payment.transactionHash;
    task.status = 'paid';

    // Log the payment
    logPaymentReleased(taskId, payment);

    // Broadcast payment event
    wsService.broadcastPaymentReleased(taskId, payment);

    // Send notification to agent
    wsService.sendToAgent(task.assignedAgent!, {
      type: 'payment_received',
      data: {
        taskId,
        amount: payment.amount,
        currency: payment.currency,
        transactionHash: payment.transactionHash,
        autoReleased: true,
      },
    });

    logger.info('Escrow auto-released successfully', {
      taskId,
      agentId: task.assignedAgent,
      amount: payment.amount,
      transactionHash: payment.transactionHash,
    });

    // In production, this would:
    // 1. Call Solana program to release escrow
    // 2. Wait for transaction confirmation
    // 3. Update database with transaction hash
  } catch (error) {
    logger.error('Failed to execute escrow release', {
      taskId,
      error: (error as Error).message,
    });
  }
}

/**
 * Generate a mock transaction hash
 * In production, this would be the Solana transaction signature
 */
function generateTransactionHash(): string {
  return (
    'auto_' +
    Date.now().toString(36) +
    Math.random().toString(36).substr(2, 9)
  );
}

/**
 * Manual escrow release (for arbitrators/admin)
 */
export async function manualEscrowRelease(
  taskId: string,
  arbitratorId: string,
  reason: string
): Promise<{ success: boolean; payment?: any; error?: string }> {
  try {
    const task = tasks.get(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.paymentReleased) {
      return { success: false, error: 'Payment already released' };
    }

    const payment = {
      taskId,
      agentId: task.assignedAgent,
      amount: task.acceptedBid?.amount || 0,
      currency: task.currency || 'USDC',
      releasedAt: Date.now(),
      transactionHash: generateTransactionHash(),
      autoReleased: false,
      arbitratorId,
      reason,
    };

    task.paymentReleased = true;
    task.paymentReleasedAt = payment.releasedAt;
    task.paymentTransactionHash = payment.transactionHash;
    task.status = 'paid';

    logPaymentReleased(taskId, payment);
    wsService.broadcastPaymentReleased(taskId, payment);

    logger.info('Escrow manually released', {
      taskId,
      arbitratorId,
      amount: payment.amount,
    });

    return { success: true, payment };
  } catch (error) {
    logger.error('Manual escrow release failed', {
      taskId,
      error: (error as Error).message,
    });
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Get escrow status for a task
 */
export function getEscrowStatus(taskId: string): {
  status: string;
  held: boolean;
  amount?: number;
  releaseScheduled?: boolean;
  releasedAt?: number;
  transactionHash?: string;
} | null {
  const task = tasks.get(taskId);
  if (!task) return null;

  return {
    status: task.status,
    held: !task.paymentReleased && task.status !== 'cancelled',
    amount: task.acceptedBid?.amount,
    releaseScheduled:
      task.status === 'verified' &&
      !task.paymentReleased &&
      config.enabled,
    releasedAt: task.paymentReleasedAt,
    transactionHash: task.paymentTransactionHash,
  };
}

/**
 * Get auto-escrow configuration
 */
export function getEscrowConfig(): EscrowReleaseConfig {
  return { ...config };
}

/**
 * Update auto-escrow configuration
 */
export function updateEscrowConfig(
  updates: Partial<EscrowReleaseConfig>
): void {
  Object.assign(config, updates);
  logger.info('Escrow config updated', config);
}

// Initialize: Check for pending releases on startup
export function initializeEscrowService(): void {
  logger.info('Initializing escrow service', config);

  // Find verified tasks with unreleased payments
  let pendingCount = 0;
  tasks.forEach((task: any, taskId: string) => {
    if (
      task.status === 'verified' &&
      !task.paymentReleased &&
      !task.disputeId
    ) {
      scheduleEscrowRelease(taskId);
      pendingCount++;
    }
  });

  if (pendingCount > 0) {
    logger.info(`Scheduled ${pendingCount} pending escrow releases`);
  }
}
