'use strict';

/**
 * @fileoverview TeamFlow API Routes
 *
 * This module defines all the Express route handlers for:
 *  - Tasks (CRUD)
 *  - Messages (Chat)
 *  - Analytics (Stats)
 *  - AI Suggestions (Vertex AI)
 *  - Activities (Live Feed)
 *  - Exports (CSV)
 */

const express = require('express');
const { body, query } = require('express-validator');
const db         = require('./db');
const cfg        = require('./config');
const ai         = require('./ai');
const middleware = require('./middleware');

const router = express.Router();

/**
 * Helper to sanitize user input.
 */
const sanitize = str => String(str || '').replace(/[<>]/g, '').trim().slice(0, cfg.MAX_SANITIZE_LEN);

/**
 * Helper to handle validation results.
 */
const validate = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// ── Auth ─────────────────────────────────────────────────────────────────────

router.get('/auth/me', middleware.verifyFirebaseToken, (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  res.json({ success: true, user: req.user });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

router.get('/tasks', async (_req, res) => {
  try {
    const tasks = await db.getAllTasks();
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    console.error('[GET /tasks]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

router.get('/tasks/:id', async (req, res) => {
  try {
    const task = await db.getTaskById(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    console.error('[GET /tasks/:id]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch task' });
  }
});

router.post('/tasks', [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: cfg.MAX_TITLE_LEN }),
  body('assignee').trim().notEmpty().withMessage('Assignee is required'),
  body('tag').isIn([...cfg.VALID_TAGS]).withMessage('Invalid tag'),
  body('priority').isIn([...cfg.VALID_PRIORITIES]).withMessage('Invalid priority'),
  validate
], async (req, res) => {
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
    console.error('[POST /tasks]', err.message);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

router.put('/tasks/:id', [
  body('status').optional().isIn([...cfg.VALID_STATUSES]).withMessage('Invalid status'),
  body('title').optional().trim().isLength({ max: cfg.MAX_TITLE_LEN }),
  validate
], async (req, res) => {
  try {
    const updates = {};
    if (req.body.status) updates.status = req.body.status;
    if (req.body.title)  updates.title  = sanitize(req.body.title);

    const task = await db.updateTask(req.params.id, updates);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    console.error('[PUT /tasks/:id]', err.message);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    const deleted = await db.deleteTask(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    console.error('[DELETE /tasks/:id]', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

// ── Messages ──────────────────────────────────────────────────────────────────

router.get('/messages', [
  query('limit').optional().isInt({ min: 1, max: cfg.MAX_MSG_LIMIT }).toInt(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  validate
], async (req, res) => {
  try {
    const limit  = req.query.limit || cfg.DEFAULT_MSG_LIMIT;
    const page   = req.query.page  || cfg.DEFAULT_PAGE;
    const result = await db.getAllMessages({ limit, page });
    res.json({
      success: true,
      data:    result.data,
      pagination: { limit, page, total: result.total }
    });
  } catch (err) {
    console.error('[GET /messages]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

router.post('/messages', [
  body('user').trim().notEmpty().isLength({ max: cfg.MAX_ASSIGNEE_LEN }),
  body('text').trim().notEmpty().isLength({ max: cfg.MAX_MSG_LEN }),
  validate
], async (req, res) => {
  try {
    const msg = await db.createMessage({
      user: sanitize(req.body.user),
      text: sanitize(req.body.text),
    });
    res.status(201).json({ success: true, data: msg });
  } catch (err) {
    console.error('[POST /messages]', err.message);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// ── AI Suggest ────────────────────────────────────────────────────────────────

router.post('/ai/suggest', [
  body('title').trim().notEmpty().withMessage('Task title is required'),
  body('tag').optional().isIn([...cfg.VALID_TAGS]),
  validate
], async (req, res) => {
  try {
    const { title, tag } = req.body;
    const analytics      = await db.getAnalytics();
    const scored         = ai.scoreMembers(title, tag, analytics);
    const top            = scored[0];
    const confidence     = Math.min(cfg.AI_MAX_CONFIDENCE, cfg.AI_BASE_CONFIDENCE + top.score * cfg.AI_SCORE_MULTIPLIER);

    res.set('X-Powered-By-AI', 'TeamFlow-Gemini');
    res.json({
      success: true,
      suggestion: {
        assignee:   top.name,
        confidence,
        reason:     ai.buildReason(top, tag, title),
        alternates: scored.slice(1).map(m => m.name),
        poweredBy:  'TeamFlow AI (Gemini Pro)'
      },
    });
  } catch (err) {
    console.error('[POST /ai/suggest]', err.message);
    res.status(500).json({ success: false, error: 'AI suggestion engine failed' });
  }
});

// ── Analytics & Activities ─────────────────────────────────────────────────────

router.get('/analytics', async (_req, res) => {
  try {
    const data = await db.getAnalytics();
    res.json({ success: true, data });
  } catch (err) {
    console.error('[GET /analytics]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

router.get('/activities', async (_req, res) => {
  try {
    const activities = await db.getAllActivities();
    res.json({ success: true, data: activities });
  } catch (err) {
    console.error('[GET /activities]', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch activities' });
  }
});

router.post('/activities', [
  body('text').trim().notEmpty().isLength({ max: cfg.MAX_ACTIVITY_LEN }),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  validate
], async (req, res) => {
  try {
    const act = await db.createActivity({
      text:  sanitize(req.body.text),
      color: req.body.color || cfg.DEFAULT_ACTIVITY_COLOR,
    });
    res.status(201).json({ success: true, data: act });
  } catch (err) {
    console.error('[POST /activities]', err.message);
    res.status(500).json({ success: false, error: 'Failed to create activity' });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

router.get('/export', async (_req, res) => {
  try {
    const tasks  = await db.getAllTasks();
    const header = 'id,title,status,assignee,tag,priority,createdAt\n';
    const rows   = tasks
      .map(t => [t.id, `"${(t.title || '').replace(/"/g, '""')}"`, t.status, t.assignee, t.tag, t.priority, t.createdAt].join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="teamflow-tasks.csv"');
    res.send(header + rows);
  } catch (err) {
    console.error('[GET /export]', err.message);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
});

module.exports = router;
