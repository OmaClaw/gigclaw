import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { body, header } from 'express-validator';
import { validate } from '../middleware/validation';
import logger from '../utils/logger';

export const apiKeysRouter = Router();

// API Key storage
const apiKeys = new Map<string, ApiKey>();
const userKeys = new Map<string, string[]>(); // userId -> keyIds

interface ApiKey {
  id: string;
  key: string;
  name: string;
  userId: string;
  permissions: Permission[];
  rateLimit: RateLimitConfig;
  createdAt: number;
  expiresAt?: number;
  lastUsedAt?: number;
  useCount: number;
  active: boolean;
}

interface Permission {
  resource: string;
  actions: ('read' | 'write' | 'delete' | 'admin')[];
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// Middleware to validate API key
export function validateApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({
      error: 'API key required',
      message: 'Include X-API-Key header with your API key',
    });
    return;
  }

  const keyData = apiKeys.get(apiKey);

  if (!keyData) {
    res.status(401).json({
      error: 'Invalid API key',
    });
    return;
  }

  if (!keyData.active) {
    res.status(403).json({
      error: 'API key deactivated',
    });
    return;
  }

  if (keyData.expiresAt && keyData.expiresAt < Date.now()) {
    res.status(403).json({
      error: 'API key expired',
      expiredAt: new Date(keyData.expiresAt).toISOString(),
    });
    return;
  }

  // Update usage stats
  keyData.lastUsedAt = Date.now();
  keyData.useCount++;

  // Attach key data to request
  (req as any).apiKey = keyData;

  logger.debug('API key validated', {
    keyId: keyData.id,
    userId: keyData.userId,
    path: req.path,
  });

  next();
}

// Middleware to check permissions
export function requirePermission(
  resource: string,
  action: 'read' | 'write' | 'delete' | 'admin'
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const keyData = (req as any).apiKey as ApiKey;

    if (!keyData) {
      res.status(401).json({ error: 'API key not validated' });
      return;
    }

    const hasPermission = keyData.permissions.some(
      (p) =>
        (p.resource === resource || p.resource === '*') &&
        (p.actions.includes(action) || p.actions.includes('admin'))
    );

    if (!hasPermission) {
      res.status(403).json({
        error: 'Insufficient permissions',
        resource,
        action,
        message: `API key does not have ${action} permission for ${resource}`,
      });
      return;
    }

    next();
  };
}

// Create rate limiter for API keys
export function createApiKeyRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: (req: Request) => {
      const keyData = (req as any).apiKey as ApiKey;
      return keyData?.rateLimit.maxRequests || 100;
    },
    keyGenerator: (req: Request) => {
      const keyData = (req as any).apiKey as ApiKey;
      return keyData?.key || req.ip || 'unknown';
    },
    handler: (req: Request, res: Response) => {
      const keyData = (req as any).apiKey as ApiKey;
      logger.warn('API key rate limit exceeded', {
        keyId: keyData?.id,
        userId: keyData?.userId,
      });

      res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests for this API key',
        retryAfter: 60,
      });
    },
  });
}

// Generate secure API key
function generateApiKey(): string {
  const prefix = 'gk_';
  const randomPart = Buffer.from(
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))
  ).toString('base64url');
  return prefix + randomPart;
}

// Create new API key
// POST /api/auth/keys
apiKeysRouter.post(
  '/',
  [
    body('name').isString().isLength({ min: 1, max: 100 }),
    body('permissions').isArray().optional(),
    body('rateLimit').optional().isObject(),
    body('expiresInDays').optional().isInt({ min: 1, max: 365 }),
    validate,
  ],
  (req: Request, res: Response) => {
    const { name, permissions = [], rateLimit, expiresInDays } = req.body;
    const userId = (req as any).apiKey?.userId || 'anonymous';

    const keyValue = generateApiKey();
    const keyId = `key_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const apiKey: ApiKey = {
      id: keyId,
      key: keyValue,
      name,
      userId,
      permissions: permissions.length > 0
        ? permissions
        : [{ resource: '*', actions: ['read', 'write'] }],
      rateLimit: rateLimit || { windowMs: 60 * 1000, maxRequests: 100 },
      createdAt: Date.now(),
      expiresAt: expiresInDays
        ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000
        : undefined,
      useCount: 0,
      active: true,
    };

    apiKeys.set(keyValue, apiKey);

    // Track user's keys
    const userKeyList = userKeys.get(userId) || [];
    userKeyList.push(keyValue);
    userKeys.set(userId, userKeyList);

    logger.info('API key created', {
      keyId,
      userId,
      name,
    });

    res.status(201).json({
      message: 'API key created successfully',
      apiKey: {
        id: keyId,
        key: keyValue, // Only shown once!
        name,
        permissions: apiKey.permissions,
        expiresAt: apiKey.expiresAt,
      },
      warning: 'Store this key securely - it will not be shown again',
    });
  }
);

// List user's API keys
// GET /api/auth/keys
apiKeysRouter.get('/', (req: Request, res: Response) => {
  const userId = (req as any).apiKey?.userId || 'anonymous';
  const userKeyList = userKeys.get(userId) || [];

  const keys = userKeyList
    .map((keyValue) => apiKeys.get(keyValue))
    .filter((k): k is ApiKey => k !== undefined)
    .map((k) => ({
      id: k.id,
      name: k.name,
      permissions: k.permissions,
      rateLimit: k.rateLimit,
      createdAt: k.createdAt,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      useCount: k.useCount,
      active: k.active,
    }));

  res.json({
    keys,
    count: keys.length,
  });
});

// Revoke API key
// DELETE /api/auth/keys/:id
apiKeysRouter.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).apiKey?.userId || 'anonymous';
  const userKeyList = userKeys.get(userId) || [];

  const keyValue = userKeyList.find((kv) => {
    const key = apiKeys.get(kv);
    return key?.id === id;
  });

  if (!keyValue) {
    return res.status(404).json({
      error: 'API key not found',
    });
  }

  const key = apiKeys.get(keyValue);
  if (key) {
    key.active = false;
  }

  // Remove from user's keys
  userKeys.set(
    userId,
    userKeyList.filter((kv) => kv !== keyValue)
  );

  logger.info('API key revoked', { keyId: id, userId });

  res.json({
    message: 'API key revoked successfully',
  });
});

// Get API key usage stats
// GET /api/auth/keys/:id/stats
apiKeysRouter.get('/:id/stats', (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).apiKey?.userId || 'anonymous';
  const userKeyList = userKeys.get(userId) || [];

  const keyValue = userKeyList.find((kv) => {
    const key = apiKeys.get(kv);
    return key?.id === id;
  });

  if (!keyValue) {
    return res.status(404).json({
      error: 'API key not found',
    });
  }

  const key = apiKeys.get(keyValue);
  if (!key) {
    return res.status(404).json({
      error: 'API key not found',
    });
  }

  res.json({
    keyId: key.id,
    name: key.name,
    useCount: key.useCount,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    active: key.active,
  });
});

// Validate and get info about current API key
// GET /api/auth/keys/validate
apiKeysRouter.get('/validate', (req: Request, res: Response) => {
  const keyData = (req as any).apiKey as ApiKey;

  if (!keyData) {
    return res.status(401).json({
      error: 'No API key provided',
    });
  }

  res.json({
    valid: true,
    keyId: keyData.id,
    userId: keyData.userId,
    permissions: keyData.permissions,
    rateLimit: keyData.rateLimit,
  });
});

export { apiKeys };
