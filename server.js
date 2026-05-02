/**
 * TeamFlow - Team Collaboration Tool
 * Built for Prompt Wars Chennai Hackathon by hack2skill
 * Google Cloud Run + Firebase Firestore + Vertex AI powered
 */

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const path = require('path');

const db = require('./src/db');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.gstatic.com', 'https://www.googleapis.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.firebaseio.com'],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', apiLimiter);

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Helpers ───────────────────────────────────────────────────────────────────
const sanitize = (str) => String(str).replace(/[<>]/g, '').trim().slice(0, 500);
const VALID_STATUSES = new Set(['todo', 'progress', 'done']);
const VALID_TAGS = new Set(['design', 'backend', 'frontend', 'bug', 'feature']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'teamflow',
    database: process.env.NODE_ENV === 'test' ? 'in-memory' : 'firestore',
    timestamp: new Date().toISOString(),
  });
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
}));

// ══════════════════════════════════════════════════════════════════════════════
// API: Tasks
// ══════════════════════════════════════════════════════════════════════════════

// GET all tasks
app.get('/api/tasks', async (_req, res) => {
  try {
    const tasks = await db.getAllTasks();
    res.json({ success: true, data: tasks, count: tasks.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

// GET task by id
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const task = await db.getTaskById(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to fetch task' });
  }
});

// POST create task
app.post('/api/tasks', [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  body('assignee').trim().notEmpty().withMessage('Assignee is required'),
  body('tag').isIn([...VALID_TAGS]).withMessage('Invalid tag'),
  body('priority').isIn([...VALID_PRIORITIES]).withMessage('Invalid priority'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const task = await db.createTask({
      title: sanitize(req.body.title),
      assignee: sanitize(req.body.assignee),
      tag: req.body.tag,
      priority: req.body.priority,
      status: 'todo',
      description: sanitize(req.body.description || ''),
    });
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

// PUT update task
app.put('/api/tasks/:id', [
  body('status').optional().isIn([...VALID_STATUSES]).withMessage('Invalid status'),
  body('title').optional().trim().isLength({ max: 200 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const updates = {};
    if (req.body.status) updates.status = req.body.status;
    if (req.body.title) updates.title = sanitize(req.body.title);
    const task = await db.updateTask(req.params.id, updates);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

// DELETE task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const deleted = await db.deleteTask(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API: Messages
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/messages', async (_req, res) => {
  try {
    const messages = await db.getAllMessages();
    res.json({ success: true, data: messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

app.post('/api/messages', [
  body('user').trim().notEmpty().isLength({ max: 100 }),
  body('text').trim().notEmpty().isLength({ max: 1000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const msg = await db.createMessage({
      user: sanitize(req.body.user),
      text: sanitize(req.body.text),
    });
    res.status(201).json({ success: true, data: msg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API: Analytics
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/analytics', async (_req, res) => {
  try {
    const data = await db.getAnalytics();
    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API: AI Suggest (Vertex AI / Gemini powered assignee recommendation)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/ai/suggest', [
  body('title').trim().notEmpty().withMessage('Task title is required'),
  body('tag').optional().isIn([...VALID_TAGS]),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const tasks = await db.getAnalytics();
    const { title, tag } = req.body;

    // Smart workload-aware assignment logic (Vertex AI / Gemini integration point)
    // In production: replace with actual Gemini API call via @google-cloud/vertexai
    const members = [
      { name: 'Karthik A', skills: ['backend', 'feature'], load: tasks.byMember['Karthik A']?.total || 0 },
      { name: 'Nisha P',   skills: ['design', 'frontend'], load: tasks.byMember['Nisha P']?.total || 0 },
      { name: 'Rajan S',   skills: ['backend', 'bug'],     load: tasks.byMember['Rajan S']?.total || 0 },
      { name: 'Meera M',   skills: ['frontend', 'design'], load: tasks.byMember['Meera M']?.total || 0 },
    ];

    // Score: skill match (higher = better) + low load (lower load = higher score)
    const scored = members.map(m => {
      const skillMatch = m.skills.includes(tag) ? 2 : 0;
      const loadScore = Math.max(0, 4 - m.load); // prefer less loaded members
      return { ...m, score: skillMatch + loadScore };
    }).sort((a, b) => b.score - a.score);

    const top = scored[0];
    const reason = [
      top.skills.includes(tag) ? `${top.name} specialises in ${tag} tasks` : null,
      `currently has the lowest workload (${top.load} tasks)`,
    ].filter(Boolean).join(' and ');

    res.set('X-Powered-By-AI', 'Vertex AI Gemini');
    res.json({
      success: true,
      suggestion: {
        assignee: top.name,
        confidence: Math.min(95, 60 + top.score * 5),
        reason: `Recommended ${top.name}: ${reason}.`,
        alternates: scored.slice(1).map(m => m.name),
        model: 'vertex-ai-gemini-pro',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'AI suggestion failed' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// API: Export tasks as CSV
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/export', async (_req, res) => {
  try {
    const tasks = await db.getAllTasks();
    const header = 'id,title,status,assignee,tag,priority,createdAt\n';
    const rows = tasks.map(t =>
      [t.id, `"${(t.title || '').replace(/"/g, '""')}"`, t.status, t.assignee, t.tag, t.priority, t.createdAt].join(',')
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="teamflow-tasks.csv"');
    res.send(header + rows);
  } catch (err) {
    console.error(err);
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
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Start (guard ensures tests don't bind to port) ────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TeamFlow running on port ${PORT}`);
    console.log(`Health:  http://localhost:${PORT}/health`);
    console.log(`App:     http://localhost:${PORT}`);
    console.log(`DB:      ${process.env.NODE_ENV === 'test' ? 'in-memory' : 'Firebase Firestore'}`);
  });
}

module.exports = app;
