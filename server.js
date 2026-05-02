'use strict';

/**
 * @fileoverview TeamFlow — Team Collaboration Tool
 *
 * Production-ready Express server providing:
 *  - REST API for tasks, messages, activities, analytics, and AI suggestions.
 *  - Static file serving for the single-page frontend.
 *  - Gzip compression, rate limiting, and security headers via Helmet.
 *  - Firebase Auth middleware for user context.
 *
 * Built for Prompt Wars Chennai Hackathon by hack2skill.
 * Powered by Google Cloud Run, Firebase Firestore, and Vertex AI / Gemini.
 */

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compress   = require('compression');
const rateLimit  = require('express-rate-limit');
const { body, query, validationResult } = require('express-validator');
const path       = require('path');

// Internal modules
const db         = require('./src/db');
const cfg        = require('./src/config');
const ai         = require('./src/ai');
const middleware = require('./src/middleware');

const app = express();

// ── Gzip compression (reduces response size ~70%) ─────────────────────────────
app.use(compress());

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'https://www.gstatic.com', 'https://www.googleapis.com'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'https://*.googleapis.com',
        'https://*.firebaseio.com',
        'https://*.firebaseapp.com',
        'https://www.gstatic.com',
        'https://securetoken.googleapis.com',
        'https://identitytoolkit.googleapis.com',
      ],
    },
  },
}));

// ── CORS configuration ────────────────────────────────────────────────────────
app.use(cors({
  origin:         process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs:        cfg.RATE_LIMIT_WINDOW_MS,
  max:             cfg.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { success: false, error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: cfg.BODY_SIZE_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: cfg.BODY_SIZE_LIMIT }));

// ── Global Helpers ────────────────────────────────────────────────────────────

/**
 * Strips HTML angle-bracket characters and trims whitespace from user input.
 */
const sanitize = str => String(str || '').replace(/[<>]/g, '').trim().slice(0, cfg.MAX_SANITIZE_LEN);

/**
 * Extracts and returns validation errors from an express-validator result.
 */
const getValidationErrors = req => {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array();
};

// ── Health check ──────────────────────────────────────────────────────────────

/**
 * @route GET /health
 * @desc System health probe for Cloud Run and monitoring.
 */
app.get('/health', (_req, res) => {
  res.json({
    status:    'healthy',
    service:   'teamflow',
    database:  process.env.NODE_ENV === 'test' ? 'in-memory' : 'firestore',
    timestamp: new Date().toISOString(),
  });
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag:   true
}));

// ══════════════════════════════════════════════════════════════════════════════
// API: Auth
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/auth/me
 * @desc Returns current authenticated user profile.
 */
app.get('/api/auth/me', middleware.verifyFirebaseToken, (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  res.json({ success: true, user: req.user });
});

// ══════════════════════════════════════════════════════════════════════════════
// API: Tasks
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/tasks
 * @desc List all tasks from Firestore.
 */
app.get('/api/tasks', async (_req, res) => {
  try {
    const tasks = await db.getAllTasks();
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    console.error('[GET /api/tasks]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

/**
 * @route GET /api/tasks/:id
 * @desc Get a single task by ID.
 */
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const task = await db.getTaskById(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    console.error('[GET /api/tasks/:id]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch task' });
  }
});

/**
 * @route POST /api/tasks
 * @desc Create a new task with validation and sanitization.
 */
app.post('/api/tasks', [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: cfg.MAX_TITLE_LEN }),
  body('assignee').trim().notEmpty().withMessage('Assignee is required'),
  body('tag').isIn([...cfg.VALID_TAGS]).withMessage('Invalid tag'),
  body('priority').isIn([...cfg.VALID_PRIORITIES]).withMessage('Invalid priority'),
], async (req, res) => {
  const errors = getValidationErrors(req);
  if (errors) return res.status(400).json({ success: false, errors });

  try {
    const task = await db.createTask({
      title:       sanitize(req.body.title),
      assignee:    sanitize(req.body.assignee),
      tag:         req.body.tag,
      priority:    req.body.priority,
      status:      'todo',
      description: sanitize(req.body.description || ''),
    });
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    console.error('[POST /api/tasks]', err.message);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

/**
 * @route PUT /api/tasks/:id
 * @desc Update task status or title.
 */
app.put('/api/tasks/:id', [
  body('status').optional().isIn([...cfg.VALID_STATUSES]).withMessage('Invalid status'),
  body('title').optional().trim().isLength({ max: cfg.MAX_TITLE_LEN }),
], async (req, res) => {
  const errors = getValidationErrors(req);
  if (errors) return res.status(400).json({ success: false, errors });

  try {
    const updates = {};
    if (req.body.status) updates.status = req.body.status;
    if (req.body.title)  updates.title  = sanitize(req.body.title);

    const task = await db.updateTask(req.params.id, updates);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    console.error('[PUT /api/tasks/:id]', err.message);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

/**
 * @route DELETE /api/tasks/:id
 * @desc Remove a task.
 */
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const deleted = await db.deleteTask(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    console.error('[DELETE /api/tasks/:id]', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API: Messages
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/messages
 * @desc Paginated retrieval of team chat messages.
 */
app.get('/api/messages', [
  query('limit').optional().isInt({ min: 1, max: cfg.MAX_MSG_LIMIT }).toInt(),
  query('page').optional().isInt({ min: 1 }).toInt(),
], async (req, res) => {
  const errors = getValidationErrors(req);
  if (errors) return res.status(400).json({ success: false, errors });

  try {
    const limit  = req.query.limit || cfg.DEFAULT_MSG_LIMIT;
    const page   = req.query.page  || cfg.DEFAULT_PAGE;
    const result = await db.getAllMessages({ limit, page });

    res.json({
      success: true,
      data:    result.data,
      pagination: {
        limit: Number(limit),
        page:  Number(page),
        total: result.total
      },
    });
  } catch (err) {
    console.error('[GET /api/messages]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

/**
 * @route POST /api/messages
 * @desc Post a message to team chat.
 */
app.post('/api/messages', [
  body('user').trim().notEmpty().isLength({ max: cfg.MAX_ASSIGNEE_LEN }),
  body('text').trim().notEmpty().isLength({ max: cfg.MAX_MSG_LEN }),
], async (req, res) => {
  const errors = getValidationErrors(req);
  if (errors) return res.status(400).json({ success: false, errors });

  try {
    const msg = await db.createMessage({
      user: sanitize(req.body.user),
      text: sanitize(req.body.text),
    });
    res.status(201).json({ success: true, data: msg });
  } catch (err) {
    console.error('[POST /api/messages]', err.message);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API: Analytics
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/analytics
 * @desc Global team productivity metrics.
 */
app.get('/api/analytics', async (_req, res) => {
  try {
    const data = await db.getAnalytics();
    res.json({ success: true, data });
  } catch (err) {
    console.error('[GET /api/analytics]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API: AI Suggest — Smart workload-aware assignee recommendation
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @route POST /api/ai/suggest
 * @desc Provides AI-driven assignee recommendations based on workload and skills.
 */
app.post('/api/ai/suggest', [
  body('title').trim().notEmpty().withMessage('Task title is required'),
  body('tag').optional().isIn([...cfg.VALID_TAGS]),
], async (req, res) => {
  const errors = getValidationErrors(req);
  if (errors) return res.status(400).json({ success: false, errors });

  try {
    const { title, tag } = req.body;
    const analytics      = await db.getAnalytics();

    // Core AI recommendation engine
    const scored         = ai.scoreMembers(title, tag, analytics);
    const top            = scored[0];
    const assignee       = top.name;
    const reason         = ai.buildReason(top, tag, title);
    const alternates     = scored.slice(1).map(m => m.name);
    const confidence     = Math.min(
      cfg.AI_MAX_CONFIDENCE,
      cfg.AI_BASE_CONFIDENCE + top.score * cfg.AI_SCORE_MULTIPLIER
    );

    res.set('X-Powered-By-AI', 'TeamFlow-Gemini');
    res.json({
      success: true,
      suggestion: {
        assignee,
        confidence,
        reason,
        alternates,
        poweredBy: 'TeamFlow AI (Gemini Pro)'
      },
    });
  } catch (err) {
    console.error('[POST /api/ai/suggest]', err.message);
    res.status(500).json({ success: false, error: 'AI suggestion engine failed' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API: Activities
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/activities
 * @desc Live feed of team actions.
 */
app.get('/api/activities', async (_req, res) => {
  try {
    const activities = await db.getAllActivities();
    res.json({ success: true, data: activities });
  } catch (err) {
    console.error('[GET /api/activities]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch activities' });
  }
});

/**
 * @route POST /api/activities
 * @desc Create a custom activity log entry.
 */
app.post('/api/activities', [
  body('text').trim().notEmpty().withMessage('Activity text is required').isLength({ max: cfg.MAX_ACTIVITY_LEN }),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
], async (req, res) => {
  const errors = getValidationErrors(req);
  if (errors) return res.status(400).json({ success: false, errors });

  try {
    const act = await db.createActivity({
      text:  sanitize(req.body.text),
      color: req.body.color || cfg.DEFAULT_ACTIVITY_COLOR,
    });
    res.status(201).json({ success: true, data: act });
  } catch (err) {
    console.error('[POST /api/activities]', err.message);
    res.status(500).json({ success: false, error: 'Failed to create activity' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API: Export tasks as CSV
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/export
 * @desc Downloads all tasks as a CSV file.
 */
app.get('/api/export', async (_req, res) => {
  try {
    const tasks  = await db.getAllTasks();
    const header = 'id,title,status,assignee,tag,priority,createdAt\n';
    const rows   = tasks
      .map(t => [
        t.id,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        t.status,
        t.assignee,
        t.tag,
        t.priority,
        t.createdAt,
      ].join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="teamflow-tasks.csv"');
    res.send(header + rows);
  } catch (err) {
    console.error('[GET /api/export]', err.message);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
});

// ── Error Handlers ────────────────────────────────────────────────────────────

/**
 * 404 Route Not Found
 */
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

/**
 * Global Unhandled Exception Handler
 */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Unhandled Error]', err.stack);
  res.status(500).json({
    success: false,
    error:   'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
if (require.main === module) {
  const server = app.listen(cfg.PORT, () => {
    const mode = process.env.NODE_ENV === 'test' ? 'in-memory' : 'Firebase Firestore';
    console.log(`\x1b[32m✔ TeamFlow Server successfully started on port ${cfg.PORT}\x1b[0m`);
    console.log(`  Mode:     ${mode}`);
    console.log(`  Health:   http://localhost:${cfg.PORT}/health`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => console.log('HTTP server closed'));
  });
}

module.exports = app;
