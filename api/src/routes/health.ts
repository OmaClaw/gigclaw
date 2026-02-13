import { Router } from 'express';
import { getConnection } from '../services/solana';
import os from 'os';

const router = Router();

// Health check endpoint with detailed metrics
router.get('/', async (req, res) => {
  const health = {
    status: 'ok',
    version: process.env.npm_package_version || '0.3.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    checks: {
      memory: checkMemory(),
      solana: await checkSolana(),
    },
  };

  // Determine overall health
  const isHealthy = health.checks.memory.status === 'ok' && health.checks.solana.status === 'ok';
  
  res.status(isHealthy ? 200 : 503).json(health);
});

// Detailed system status
router.get('/detailed', async (req, res) => {
  const detailed = {
    status: 'ok',
    version: process.env.npm_package_version || '0.3.0',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: process.uptime(),
      formatted: formatUptime(process.uptime()),
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      pid: process.pid,
    },
    memory: getMemoryStats(),
    cpu: getCPUStats(),
    solana: await getSolanaStatus(),
  };

  res.json(detailed);
});

// Readiness probe (for Kubernetes)
router.get('/ready', (req, res) => {
  res.status(200).json({ ready: true });
});

// Liveness probe (for Kubernetes)
router.get('/live', (req, res) => {
  res.status(200).json({ alive: true });
});

// Helper functions
function checkMemory() {
  const used = process.memoryUsage();
  const threshold = 500 * 1024 * 1024; // 500MB
  
  return {
    status: used.heapUsed < threshold ? 'ok' : 'warning',
    used: Math.round(used.heapUsed / 1024 / 1024) + 'MB',
    total: Math.round(used.heapTotal / 1024 / 1024) + 'MB',
    rss: Math.round(used.rss / 1024 / 1024) + 'MB',
  };
}

async function checkSolana() {
  try {
    const conn = getConnection();
    const version = await conn.getVersion();
    return {
      status: 'ok',
      version: version['solana-core'],
      network: process.env.SOLANA_NETWORK || 'devnet',
    };
  } catch (error) {
    return {
      status: 'error',
      error: 'Unable to connect to Solana',
      network: process.env.SOLANA_NETWORK || 'devnet',
    };
  }
}

function getMemoryStats() {
  const used = process.memoryUsage();
  const system = os.totalmem();
  const free = os.freemem();
  
  return {
    process: {
      heapUsed: Math.round(used.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(used.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(used.rss / 1024 / 1024) + 'MB',
      external: Math.round(used.external / 1024 / 1024) + 'MB',
    },
    system: {
      total: Math.round(system / 1024 / 1024 / 1024) + 'GB',
      free: Math.round(free / 1024 / 1024 / 1024) + 'GB',
      used: Math.round((system - free) / 1024 / 1024 / 1024) + 'GB',
      percentage: Math.round(((system - free) / system) * 100) + '%',
    },
  };
}

function getCPUStats() {
  const loadAvg = os.loadavg();
  const cpus = os.cpus();
  
  return {
    loadAverage: {
      '1m': loadAvg[0].toFixed(2),
      '5m': loadAvg[1].toFixed(2),
      '15m': loadAvg[2].toFixed(2),
    },
    count: cpus.length,
    model: cpus[0]?.model || 'unknown',
  };
}

async function getSolanaStatus() {
  try {
    const conn = getConnection();
    const [version, slot, blockHeight] = await Promise.all([
      conn.getVersion(),
      conn.getSlot(),
      conn.getBlockHeight().catch(() => null),
    ]);
    
    return {
      status: 'connected',
      version: version['solana-core'],
      network: process.env.SOLANA_NETWORK || 'devnet',
      currentSlot: slot,
      blockHeight: blockHeight,
    };
  } catch (error) {
    return {
      status: 'disconnected',
      network: process.env.SOLANA_NETWORK || 'devnet',
      error: 'Unable to connect to Solana RPC',
    };
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  return `${minutes}m ${secs}s`;
}

export { router as healthRouter };
