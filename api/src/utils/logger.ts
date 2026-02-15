import winston from 'winston';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(colors);

// Define the format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...metadata } = info;
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Define the format for file output (JSON for parsing)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Determine log level from environment
const level = process.env.LOG_LEVEL || 'info';

// Create the logger
const logger = winston.createLogger({
  level,
  levels,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // Error log file
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: fileFormat,
    }),
    // Combined log file
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: fileFormat,
    }),
  ],
  exitOnError: false,
});

// Create logs directory if it doesn't exist
import fs from 'fs';
import path from 'path';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// HTTP request logger middleware
export const httpLogger = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Export a stream object for Morgan integration
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

export default logger;

// Helper functions for structured logging
export const logTaskCreated = (taskId: string, posterId: string, budget: number) => {
  logger.info('Task created', { taskId, posterId, budget, type: 'task_created' });
};

export const logBidPlaced = (taskId: string, agentId: string, amount: number) => {
  logger.info('Bid placed', { taskId, agentId, amount, type: 'bid_placed' });
};

export const logBlockchainWrite = (
  taskId: string,
  signature: string,
  status: string
) => {
  logger.info('Blockchain write', { taskId, signature, status, type: 'blockchain_write' });
};

export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error(error.message, { 
    stack: error.stack, 
    ...context,
    type: 'error'
  });
};

export const logAgentAction = (
  agentId: string,
  action: string,
  details?: Record<string, any>
) => {
  logger.info(`Agent ${action}`, { agentId, action, ...details, type: 'agent_action' });
};

export const logPaymentReleased = (taskId: string, payment: any) => {
  logger.info('Payment released', {
    taskId,
    agentId: payment.agentId,
    amount: payment.amount,
    currency: payment.currency,
    autoReleased: payment.autoReleased,
    type: 'payment_released'
  });
};
