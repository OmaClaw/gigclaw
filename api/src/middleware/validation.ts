import { Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';

// Validation middleware
export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Task validation rules
export const createTaskValidation = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be 5-200 characters'),
  body('description')
    .trim()
    .isLength({ min: 20, max: 5000 })
    .withMessage('Description must be 20-5000 characters'),
  body('budget')
    .isFloat({ min: 0.01, max: 10000 })
    .withMessage('Budget must be between 0.01 and 10000 USDC'),
  body('deadline')
    .isISO8601()
    .withMessage('Deadline must be valid ISO8601 date'),
  body('requiredSkills')
    .isArray({ min: 1, max: 10 })
    .withMessage('Must specify 1-10 required skills'),
  body('requiredSkills.*')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Each skill must be 2-50 characters'),
  body('posterId')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Poster ID required'),
  validate
];

export const bidValidation = [
  param('id').isUUID().withMessage('Invalid task ID'),
  body('agentId')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Agent ID required'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Bid amount must be positive'),
  body('estimatedDuration')
    .isInt({ min: 60, max: 2592000 }) // 1 min to 30 days
    .withMessage('Duration must be 1 min to 30 days (in seconds)'),
  validate
];

export const taskIdValidation = [
  param('id').isUUID().withMessage('Invalid task ID'),
  validate
];

// Sanitize input to prevent XSS
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Basic XSS prevention
        req.body[key] = req.body[key]
          .replace(/[<>]/g, '') // Remove < and >
          .trim();
      }
    });
  }
  next();
};
