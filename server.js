'use strict';

/**
 * @fileoverview TeamFlow — Team Collaboration Tool
 *
 * Production-ready Express server providing:
 *  - REST API for tasks, messages, activities, analytics, and AI suggestions.
 *  - Static file serving for the single-page frontend.
 *  - Gzip compression, rate limiting, and security headers via Helmet.
 *  - Soft Firebase Auth middleware (token verification without blocking requests).
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

const db  = require('./src/db');
const cfg = require('./src/config');

const app = express();

// ── Gzip compression (reduces response size ~70 %) ────────────────────────────
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
  message:         { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: cfg.BODY_SIZE_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: cfg.BODY_SIZE_LIMIT }));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Strips HTML angle-bracket characters and trims whitespace from user input.
 *
 * @param {string} str - Raw user-supplied string.
 * @returns {string} Sanitized string capped at {@link cfg.MAX_SANITIZE_LEN} chars.
 */
const sanitize = str => String(str).replace(/[<>]/g, '').trim().slice(0, cfg.MAX_SANITIZE_LEN);

/**
 * Extracts and returns validation errors from an express-validator result,
 * or returns `null` when there are no errors.
 *
 * @param {import('express').Request} req
 * @returns {Array|null}
 */
const getValidationErrors = req => {
  const result = validationResult(req);
  return result.isEmpty() ? null : result.array();
};

// ── Firebase Auth middleware ──────────────────────────────────────────────────

/**
 * Soft Firebase ID token verifier.
 *
 * Reads `Authorization: Bearer <token>` from the request header. If present,
 * verifies it against the Firebase Auth project and attaches `req.user`.
 * Unauthenticated requests are allowed through unchanged — enforcement is
 * left to individual route handlers.
 *
 * @type {import('express').RequestHandler}
 */
const FIREBASE_AUTH_PROJECT = cfg.FIREBASE_AUTH_PROJECT;

async function verifyFirebaseToken(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    const admin = require('firebase-admin');
    let authApp = admin.apps.find(a => a.name === 'auth-app');
    if (!authApp) {
      authApp = admin.initializeApp(
        { credential: admin.credential.applicationDefault(), projectId: FIREBASE_AUTH_PROJECT },
        'auth-app',
      );
    }
    const decoded = await authApp.auth().verifyIdToken(header.slice(7));
    req.user = { uid: decoded.uid, email: decoded.email, name: decoded.name || decoded.email };
  } catch (err) {
    console.warn('[Auth] Invalid token:', err.message);
  }
  next();
}

// ── Health check ──────────────────────────────────────────────────────────────

/**
 * @route GET /health
 * @returns {{ status: string, service: string, database: string, timestamp: string }}
 */
app.get('/health', (_req, res) => {
  res.json({
    status:    'healthy',
    service:   'teamflow',
    database:  process.env.NODE_ENV === 'test' ? 'in-memory' : 'firestore',
    timestamp: new Date().toISOString(),
  });
});

// ── Auth: current user ────────────────────────────────────────────────────────

/**
 * @route GET /api/auth/me
 * @returns {{ success: boolean, user: Object }}
 */
app.get('/api/auth/me', verifyFirebaseToken, (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  res.json({ success: true, user: req.user });
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d', etag: true }));

// ══════════════════════════════════════════════════════════════════════════════
// API: Tasks
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/tasks
 * @returns {{ success: boolean, data: Task[], count: number }}
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
 * @param {string} req.params.id - Task document ID.
 * @returns {{ success: boolean, data: Task }}
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
 * @body {{ title: string, assignee: string, tag: string, priority: string, description?: string }}
 * @returns {{ success: boolean, data: Task }}
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
 * @param {string} req.params.id
 * @body {{ status?: string, title?: string }}
 * @returns {{ success: boolean, data: Task }}
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
 * @param {string} req.params.id
 * @returns {{ success: boolean, message: string }}
 */
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const deleted = await db.deleteTask(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, message: 'Task deleted' });
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
 * @query {number} [limit=50] - Page size (1–200).
 * @query {number} [page=1]   - Page number.
 * @returns {{ success: boolean, data: Message[], pagination: Object }}
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
      pagination: { limit: Number(limit), page: Number(page), total: result.total },
    });
  } catch (err) {
    console.error('[GET /api/messages]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

/**
 * @route POST /api/messages
 * @body {{ user: string, text: string }}
 * @returns {{ success: boolean, data: Message }}
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
 * @returns {{ success: boolean, data: Analytics }}
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
 * Scores each team member using a multi-factor heuristic:
 *  - Skill match: +2 if the member's skills include the task tag.
 *  - Keyword match: +1 if the task title mentions a skill keyword.
 *  - Workload balance: +0 to +4 based on current task load (fewer = higher score).
 *
 * @param {string} title      - Task title for keyword analysis.
 * @param {string} tag        - Task category tag.
 * @param {Analytics} analytics - Current team workload data.
 * @returns {{ name: string, skills: string[], load: number, score: number }[]} Sorted best-first.
 */
function scoreMembers(title, tag, analytics) {
  const titleLower = (title || '').toLowerCase();
  return cfg.TEAM_MEMBERS
    .map(m => {
      const load         = analytics.byMember[m.name]?.total || 0;
      const skillMatch   = m.skills.includes(tag) ? cfg.AI_SKILL_MATCH_BONUS : 0;
      const keywordMatch = m.skills.some(s => titleLower.includes(s)) ? 1 : 0;
      const loadScore    = Math.max(0, cfg.AI_LOAD_MAX_SCORE - load);
      return { ...m, load, score: skillMatch + keywordMatch + loadScore };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Generates a human-readable explanation for why a member was recommended.
 *
 * @param {{ name: string, skills: string[], load: number }} member
 * @param {string} tag   - Task category.
 * @param {string} title - Task title.
 * @returns {string}
 */
function buildReason(member, tag, title) {
  const parts = [];
  if (member.skills.includes(tag)) {
    parts.push(`${member.name} specialises in ${tag} tasks`);
  }
  const titleLower = (title || '').toLowerCase();
  const matchedSkill = member.skills.find(s => s !== tag && titleLower.includes(s));
  if (matchedSkill) {
    parts.push(`the task mentions ${matchedSkill} which matches their expertise`);
  }
  parts.push(`they currently have the lowest workload (${member.load} active task${member.load !== 1 ? 's' : ''})`);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`
    : `${parts[0]}.`;
}

/**
 * @route POST /api/ai/suggest
 * @body {{ title: string, tag?: string }}
 * @returns {{ success: boolean, suggestion: { assignee, confidence, reason, alternates, poweredBy } }}
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
    const scored         = scoreMembers(title, tag, analytics);
    const top            = scored[0];
    const assignee       = top.name;
    const reason         = buildReason(top, tag, title);
    const alternates     = scored.slice(1).map(m => m.name);
    const confidence     = Math.min(cfg.AI_MAX_CONFIDENCE, cfg.AI_BASE_CONFIDENCE + top.score * cfg.AI_SCORE_MULTIPLIER);

    res.set('X-Powered-By-AI', 'teamflow-ai');
    res.json({
      success: true,
      suggestion: { assignee, confidence, reason, alternates, poweredBy: 'teamflow-ai' },
    });
  } catch (err) {
    console.error('[POST /api/ai/suggest]', err.message);
    res.status(500).json({ success: false, error: 'AI suggestion failed' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API: Activities
// ══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/activities
 * @returns {{ success: boolean, data: Activity[] }}
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
 * @body {{ text: string, color?: string }}
 * @returns {{ success: boolean, data: Activity }}
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
 * @returns {text/csv} All tasks as a CSV download.
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

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Unhandled]', err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start server ──────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(cfg.PORT, () => {
    console.log(`TeamFlow running on port ${cfg.PORT}`);
    console.log(`Health:  http://localhost:${cfg.PORT}/health`);
    console.log(`App:     http://localhost:${cfg.PORT}`);
    console.log(`DB:      ${process.env.NODE_ENV === 'test' ? 'in-memory' : 'Firebase Firestore'}`);
  });
}

module.exports = app;
