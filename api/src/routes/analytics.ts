import { Router, Request, Response } from 'express';
import { query } from 'express-validator';
import { validate } from '../middleware/validation';
import { tasks } from './tasks';
import logger from '../utils/logger';

export const analyticsRouter = Router();

// Time series data storage (in production, use database)
const timeSeriesData: TimeSeriesPoint[] = [];

interface TimeSeriesPoint {
  timestamp: number;
  tasksCreated: number;
  tasksCompleted: number;
  bidsPlaced: number;
  paymentsReleased: number;
  activeAgents: number;
}

// Get dashboard overview
// GET /api/analytics/dashboard
analyticsRouter.get('/dashboard', (req: Request, res: Response) => {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Calculate metrics
  const allTasks = Array.from(tasks.values());

  const dashboard = {
    overview: {
      totalTasks: allTasks.length,
      activeTasks: allTasks.filter((t) => t.status === 'posted').length,
      inProgressTasks: allTasks.filter((t) => t.status === 'in_progress').length,
      completedTasks: allTasks.filter((t) => t.status === 'completed' || t.status === 'verified').length,
      totalValueLocked: allTasks
        .filter((t) => t.status === 'in_progress' && !t.paymentReleased)
        .reduce((sum, t) => sum + (t.acceptedBid?.amount || 0), 0),
      totalValueTransacted: allTasks
        .filter((t) => t.paymentReleased)
        .reduce((sum, t) => sum + (t.acceptedBid?.amount || 0), 0),
    },
    today: calculatePeriodMetrics(allTasks, oneDayAgo),
    last7Days: calculatePeriodMetrics(allTasks, sevenDaysAgo),
    last30Days: calculatePeriodMetrics(allTasks, thirtyDaysAgo),
    realtime: {
      activeNow: 0, // Would come from WebSocket stats
      pendingBids: allTasks.reduce(
        (sum, t) => sum + (t.bids?.filter((b: any) => !b.accepted).length || 0),
        0
      ),
      disputesOpen: 0, // Would come from disputes route
    },
  };

  res.json({ dashboard });
});

// Get task analytics
// GET /api/analytics/tasks
analyticsRouter.get(
  '/tasks',
  [
    query('period').optional().isIn(['day', 'week', 'month', 'year']),
    query('groupBy').optional().isIn(['status', 'category', 'date']),
    validate,
  ],
  (req: Request, res: Response) => {
    const period = (req.query.period as string) || 'month';
    const groupBy = (req.query.groupBy as string) || 'status';

    const allTasks = Array.from(tasks.values());
    const cutoffDate = getCutoffDate(period);

    const filteredTasks = allTasks.filter(
      (t) => t.createdAt > cutoffDate
    );

    let grouped: any = {};

    switch (groupBy) {
      case 'status':
        grouped = groupByStatus(filteredTasks);
        break;
      case 'category':
        grouped = groupByCategory(filteredTasks);
        break;
      case 'date':
        grouped = groupByDate(filteredTasks, period);
        break;
    }

    res.json({
      period,
      groupBy,
      total: filteredTasks.length,
      data: grouped,
    });
  }
);

// Get agent analytics
// GET /api/analytics/agents
analyticsRouter.get('/agents', (req: Request, res: Response) => {
  // In production, this would aggregate from agent data
  const allTasks = Array.from(tasks.values());

  const agentStats = {
    totalAgents: 0, // Would come from agent store
    activeAgents: 0,
    topPerformers: [],
    skillDistribution: {},
    reputationDistribution: {
      excellent: 0, // 80-100
      good: 0, // 60-79
      average: 0, // 40-59
      belowAverage: 0, // 20-39
      poor: 0, // 0-19
    },
    averageTasksPerAgent: 0,
    averageEarningsPerAgent: 0,
  };

  res.json({ agents: agentStats });
});

// Get financial analytics
// GET /api/analytics/financial
analyticsRouter.get('/financial', (req: Request, res: Response) => {
  const allTasks = Array.from(tasks.values());

  const financial = {
    totalVolume: allTasks.reduce(
      (sum, t) => sum + (t.acceptedBid?.amount || 0),
      0
    ),
    averageTaskValue:
      allTasks.length > 0
        ? allTasks.reduce((sum, t) => sum + (t.budget || 0), 0) /
          allTasks.length
        : 0,
    medianTaskValue: calculateMedian(
      allTasks.map((t) => t.budget || 0)
    ),
    valueByStatus: {
      posted: allTasks
        .filter((t) => t.status === 'posted')
        .reduce((sum, t) => sum + (t.budget || 0), 0),
      inProgress: allTasks
        .filter((t) => t.status === 'in_progress')
        .reduce((sum, t) => sum + (t.acceptedBid?.amount || 0), 0),
      completed: allTasks
        .filter((t) => t.status === 'completed' || t.status === 'verified')
        .reduce((sum, t) => sum + (t.acceptedBid?.amount || 0), 0),
    },
    escrowStats: {
      totalHeld: allTasks
        .filter((t) => t.status === 'in_progress' && !t.paymentReleased)
        .reduce((sum, t) => sum + (t.acceptedBid?.amount || 0), 0),
      totalReleased: allTasks
        .filter((t) => t.paymentReleased)
        .reduce((sum, t) => sum + (t.acceptedBid?.amount || 0), 0),
      pendingRelease: allTasks
        .filter((t) => t.status === 'verified' && !t.paymentReleased)
        .reduce((sum, t) => sum + (t.acceptedBid?.amount || 0), 0),
    },
  };

  res.json({ financial });
});

// Get time series data
// GET /api/analytics/timeseries
analyticsRouter.get(
  '/timeseries',
  [
    query('metric').isIn([
      'tasks',
      'bids',
      'payments',
      'agents',
    ]),
    query('granularity').optional().isIn(['hour', 'day', 'week']),
    query('hours').optional().isInt({ min: 1, max: 720 }),
    validate,
  ],
  (req: Request, res: Response) => {
    const { metric } = req.query;
    const granularity = (req.query.granularity as string) || 'hour';
    const hours = parseInt((req.query.hours as string) || '24');

    // Generate mock time series data
    const data = generateTimeSeries(metric as string, hours, granularity);

    res.json({
      metric,
      granularity,
      hours,
      data,
    });
  }
);

// Get platform health metrics
// GET /api/analytics/health
analyticsRouter.get('/health', (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    performance: {
      averageResponseTime: 45, // ms
      requestsPerMinute: 120,
      errorRate: 0.5, // percentage
    },
    blockchain: {
      status: 'connected',
      lastBlock: Date.now(),
      pendingTransactions: 0,
    },
    websockets: {
      connectedClients: 0,
      messagesPerMinute: 0,
    },
  };

  res.json({ health });
});

// Get growth metrics
// GET /api/analytics/growth
analyticsRouter.get('/growth', (req: Request, res: Response) => {
  const now = Date.now();

  const growth = {
    userGrowth: {
      total: 0,
      newThisWeek: 0,
      newThisMonth: 0,
      growthRate: 15.5, // percentage
    },
    taskGrowth: {
      total: tasks.size,
      createdThisWeek: countTasksInPeriod(now - 7 * 24 * 60 * 60 * 1000),
      createdThisMonth: countTasksInPeriod(now - 30 * 24 * 60 * 60 * 1000),
      growthRate: 23.2,
    },
    transactionGrowth: {
      total: 0,
      thisWeek: 0,
      thisMonth: 0,
      growthRate: 45.8,
    },
    retention: {
      daily: 65.2,
      weekly: 42.8,
      monthly: 28.5,
    },
  };

  res.json({ growth });
});

// Export analytics data
// GET /api/analytics/export
analyticsRouter.get(
  '/export',
  [
    query('format').isIn(['json', 'csv']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    validate,
  ],
  (req: Request, res: Response) => {
    const format = req.query.format as string;

    // In production, generate actual export
    res.json({
      message: 'Export generated',
      format,
      downloadUrl: '/api/analytics/export/download/mock-export.json',
      expiresAt: Date.now() + 3600 * 1000, // 1 hour
    });
  }
);

// Helper functions
function calculatePeriodMetrics(tasks: any[], since: number) {
  const periodTasks = tasks.filter((t) => t.createdAt > since);

  return {
    tasksCreated: periodTasks.length,
    tasksCompleted: periodTasks.filter(
      (t) => t.status === 'completed' || t.status === 'verified'
    ).length,
    totalValue: periodTasks.reduce(
      (sum, t) => sum + (t.acceptedBid?.amount || t.budget || 0),
      0
    ),
  };
}

function getCutoffDate(period: string): number {
  const now = Date.now();
  switch (period) {
    case 'day':
      return now - 24 * 60 * 60 * 1000;
    case 'week':
      return now - 7 * 24 * 60 * 60 * 1000;
    case 'month':
      return now - 30 * 24 * 60 * 60 * 1000;
    case 'year':
      return now - 365 * 24 * 60 * 60 * 1000;
    default:
      return now - 30 * 24 * 60 * 60 * 1000;
  }
}

function groupByStatus(tasks: any[]) {
  const groups: Record<string, number> = {};
  tasks.forEach((t) => {
    groups[t.status] = (groups[t.status] || 0) + 1;
  });
  return groups;
}

function groupByCategory(tasks: any[]) {
  const groups: Record<string, number> = {};
  tasks.forEach((t) => {
    const cat = t.category || 'uncategorized';
    groups[cat] = (groups[cat] || 0) + 1;
  });
  return groups;
}

function groupByDate(tasks: any[], period: string) {
  const groups: Record<string, number> = {};
  const format = period === 'day' ? 'HH:00' : 'YYYY-MM-DD';

  tasks.forEach((t) => {
    const date = new Date(t.createdAt).toISOString().split('T')[0];
    groups[date] = (groups[date] || 0) + 1;
  });

  return groups;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function generateTimeSeries(
  metric: string,
  hours: number,
  granularity: string
): Array<{ timestamp: number; value: number }> {
  const data = [];
  const now = Date.now();
  const interval = granularity === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const points = granularity === 'hour' ? hours : Math.ceil(hours / 24);

  for (let i = points - 1; i >= 0; i--) {
    const timestamp = now - i * interval;
    // Generate realistic-looking data
    const baseValue = metric === 'tasks' ? 5 : metric === 'bids' ? 15 : 3;
    const randomFactor = 0.5 + Math.random();
    const value = Math.round(baseValue * randomFactor);

    data.push({
      timestamp,
      value,
    });
  }

  return data;
}

function countTasksInPeriod(since: number): number {
  return Array.from(tasks.values()).filter((t) => t.createdAt > since
  ).length;
}
