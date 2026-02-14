import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { validate } from '../middleware/validation';
import { wsService } from '../services/websocket';
import logger, { logTaskCreated } from '../utils/logger';

export const taskCategoriesRouter = Router();

// Task categories and tags system
const categories = new Map<string, TaskCategory>();
const tags = new Map<string, TagStats>();

interface TaskCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  taskCount: number;
  averageBudget: number;
  popularTags: string[];
  subcategories: string[];
}

interface TagStats {
  name: string;
  taskCount: number;
  searchCount: number;
  trending: boolean;
  relatedTags: string[];
}

// Initialize default categories
function initializeCategories() {
  const defaultCategories: TaskCategory[] = [
    {
      id: 'development',
      name: 'Development',
      description: 'Smart contracts, APIs, integrations, and software development',
      icon: '💻',
      color: '#3B82F6',
      taskCount: 0,
      averageBudget: 0,
      popularTags: ['rust', 'typescript', 'api', 'smart-contracts', 'web3'],
      subcategories: ['smart-contracts', 'backend', 'frontend', 'devops'],
    },
    {
      id: 'security',
      name: 'Security',
      description: 'Audits, penetration testing, vulnerability assessments',
      icon: '🔒',
      color: '#EF4444',
      taskCount: 0,
      averageBudget: 0,
      popularTags: ['audit', 'vulnerability', 'penetration-test', 'review'],
      subcategories: ['smart-contract-audit', 'infrastructure', 'compliance'],
    },
    {
      id: 'design',
      name: 'Design',
      description: 'UI/UX, graphics, branding, and visual design',
      icon: '🎨',
      color: '#8B5CF6',
      taskCount: 0,
      averageBudget: 0,
      popularTags: ['ui', 'ux', 'branding', 'illustration', 'motion'],
      subcategories: ['ui-design', 'ux-research', 'branding', 'illustration'],
    },
    {
      id: 'data',
      name: 'Data',
      description: 'Analytics, machine learning, data processing',
      icon: '📊',
      color: '#10B981',
      taskCount: 0,
      averageBudget: 0,
      popularTags: ['analytics', 'ml', 'processing', 'visualization', 'sql'],
      subcategories: ['analytics', 'ml', 'etl', 'visualization'],
    },
    {
      id: 'marketing',
      name: 'Marketing',
      description: 'Content, social media, growth, and community',
      icon: '📢',
      color: '#F59E0B',
      taskCount: 0,
      averageBudget: 0,
      popularTags: ['content', 'social', 'seo', 'community', 'growth'],
      subcategories: ['content', 'social-media', 'seo', 'community'],
    },
    {
      id: 'operations',
      name: 'Operations',
      description: 'DevOps, infrastructure, automation, and tooling',
      icon: '⚙️',
      color: '#6B7280',
      taskCount: 0,
      averageBudget: 0,
      popularTags: ['devops', 'ci-cd', 'automation', 'monitoring', 'deployment'],
      subcategories: ['devops', 'sre', 'automation', 'tooling'],
    },
  ];

  defaultCategories.forEach((cat) => categories.set(cat.id, cat));
}

initializeCategories();

// Get all categories
// GET /api/tasks/categories
taskCategoriesRouter.get('/', (req: Request, res: Response) => {
  const allCategories = Array.from(categories.values());

  res.json({
    categories: allCategories,
    count: allCategories.length,
  });
});

// Get category by ID
// GET /api/tasks/categories/:id
taskCategoriesRouter.get(
  '/:id',
  [param('id').isString().trim()],
  validate,
  (req: Request, res: Response) => {
    const category = categories.get(req.params.id);

    if (!category) {
      return res.status(404).json({
        error: 'Category not found',
        id: req.params.id,
      });
    }

    res.json({ category });
  }
);

// Get trending tags
// GET /api/tasks/tags/trending
taskCategoriesRouter.get('/tags/trending', (req: Request, res: Response) => {
  const trendingTags = Array.from(tags.values())
    .filter((tag) => tag.trending)
    .sort((a, b) => b.searchCount - a.searchCount)
    .slice(0, 20);

  res.json({
    tags: trendingTags,
    count: trendingTags.length,
  });
});

// Search tags
// GET /api/tasks/tags/search
taskCategoriesRouter.get(
  '/tags/search',
  [query('q').isString().trim()],
  validate,
  (req: Request, res: Response) => {
    const query_term = (req.query.q as string).toLowerCase();

    const matchingTags = Array.from(tags.values()).filter((tag) =>
      tag.name.toLowerCase().includes(query_term)
    );

    // Increment search count for analytics
    matchingTags.forEach((tag) => {
      tag.searchCount++;
    });

    res.json({
      query: query_term,
      tags: matchingTags,
      count: matchingTags.length,
    });
  }
);

// Get tag suggestions for a task
// POST /api/tasks/tags/suggest
taskCategoriesRouter.post(
  '/tags/suggest',
  [
    body('title').optional().isString(),
    body('description').optional().isString(),
    body('category').optional().isString(),
  ],
  validate,
  (req: Request, res: Response) => {
    const { title = '', description = '', category } = req.body;
    const text = `${title} ${description}`.toLowerCase();

    // Get category-specific tags
    const cat = category ? categories.get(category) : null;
    const categoryTags = cat?.popularTags || [];

    // Find matching tags from all categories
    const allTags = Array.from(tags.values());
    const matchingTags = allTags
      .filter((tag) => {
        // Check if tag appears in text
        if (text.includes(tag.name.toLowerCase())) return true;
        // Check related tags
        return tag.relatedTags.some((rt) => text.includes(rt.toLowerCase())
        );
      })
      .sort((a, b) => b.taskCount - a.taskCount)
      .slice(0, 10);

    // Combine with category defaults
    const suggestions = [
      ...new Set([
        ...categoryTags.slice(0, 5),
        ...matchingTags.map((t) => t.name),
      ]),
    ].slice(0, 10);

    res.json({
      suggestions,
      category: cat?.name,
      matchedTags: matchingTags.map((t) => t.name),
    });
  }
);

// Create or update a tag
taskCategoriesRouter.post(
  '/tags',
  [
    body('name').isString().trim().isLength({ min: 1, max: 50 }),
    body('relatedTags').optional().isArray(),
    validate,
  ],
  (req: Request, res: Response) => {
    const { name, relatedTags = [] } = req.body;
    const normalizedName = name.toLowerCase().trim();

    let tag = tags.get(normalizedName);

    if (!tag) {
      tag = {
        name: normalizedName,
        taskCount: 0,
        searchCount: 0,
        trending: false,
        relatedTags,
      };
      tags.set(normalizedName, tag);
    } else {
      // Update related tags
      tag.relatedTags = [
        ...new Set([...tag.relatedTags, ...relatedTags]),
      ].slice(0, 10);
    }

    res.status(201).json({ tag });
  }
);

// Update category stats (internal use)
export function updateCategoryStats(
  categoryId: string,
  budget: number
): void {
  const category = categories.get(categoryId);
  if (!category) return;

  category.taskCount++;

  // Update average budget
  if (category.averageBudget === 0) {
    category.averageBudget = budget;
  } else {
    category.averageBudget =
      (category.averageBudget * (category.taskCount - 1) + budget) /
      category.taskCount;
  }
}

// Update tag stats (internal use)
export function updateTagStats(tagName: string): void {
  const normalizedName = tagName.toLowerCase().trim();
  let tag = tags.get(normalizedName);

  if (!tag) {
    tag = {
      name: normalizedName,
      taskCount: 1,
      searchCount: 0,
      trending: false,
      relatedTags: [],
    };
    tags.set(normalizedName, tag);
  } else {
    tag.taskCount++;
  }

  // Mark as trending if task count > 5
  if (tag.taskCount > 5) {
    tag.trending = true;
  }
}

// Get category statistics
// GET /api/tasks/categories/stats/overview
taskCategoriesRouter.get('/stats/overview', (req: Request, res: Response) => {
  const allCategories = Array.from(categories.values());
  const allTags = Array.from(tags.values());

  const stats = {
    totalCategories: allCategories.length,
    totalTags: allTags.length,
    totalTasks: allCategories.reduce((sum, cat) => sum + cat.taskCount, 0),
    trendingTagsCount: allTags.filter((t) => t.trending).length,
    categoryDistribution: allCategories.map((cat) => ({
      name: cat.name,
      taskCount: cat.taskCount,
      percentage:
        allCategories.reduce((sum, c) => sum + c.taskCount, 0) > 0
          ? Math.round(
              (cat.taskCount /
                allCategories.reduce((sum, c) => sum + c.taskCount, 0)) *
                100
            )
          : 0,
    })),
    topTags: allTags
      .sort((a, b) => b.taskCount - a.taskCount)
      .slice(0, 10)
      .map((t) => ({
        name: t.name,
        taskCount: t.taskCount,
        trending: t.trending,
      })),
  };

  res.json({ stats });
});

export { categories, tags };
