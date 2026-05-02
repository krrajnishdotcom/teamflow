/**
 * TeamFlow - Team Collaboration Tool
 * Built for Prompt Wars Chennai Hackathon by hack2skill
 * Google Cloud Run + Firebase + Vertex AI powered
 */

'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const path = require('path');

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

// ── In-memory store (replace with Firestore in production) ───────────────────
const store = {
  tasks: [
    { id: '1', title: 'Design wireframes', status: 'todo',     tag: 'design',   assignee: 'Nisha P',   priority: 'high',   createdAt: new Date().toISOString() },
    { id: '2', title: 'Set up Cloud Run', status: 'progress',  tag: 'backend',  assignee: 'Karthik A', priority: 'high',   createdAt: new Date().toISOString() },
    { id: '3', title: 'API endpoints',    status: 'progress',  tag: 'backend',  assignee: 'Rajan S',   priority: 'medium', createdAt: new Date().toISOString() },
    { id: '4', title: 'Auth integration', status: 'done',      tag: 'feature',  assignee: 'Karthik A', priority: 'high',   createdAt: new Date().toISOString() },
    { id: '5', title: 'UI components',    status: 'todo',      tag: 'frontend', assignee: 'Meera M',   priority: 'medium', createdAt: new Date().toISOString() },
  ],
  messages: [
    { id: '1', user: 'Karthik A', text: 'Cloud Run is live!', timestamp: new Date().toISOString() },
    { id: '2', user: 'Nisha P',   text: 'Wireframes ready for review.', timestamp: new Date().toISOString() },
  ],
  nextId: 6,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const sanitize = (str) => String(str).replace(/[<>]/g, '').trim().slice(0, 500);
const VALID_STATUSES = new Set(['todo', 'progress', 'done']);
const VALID_TAGS = new Set(['design', 'backend', 'frontend', 'bug', 'feature']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'teamflow', timestamp: new Date().toISOString() });
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
}));

// ── API: Tasks ────────────────────────────────────────────────────────────────

// GET all tasks
app.get('/api/tasks', (_req, res) => {
  res.json({ success: true, data: store.tasks, count: store.tasks.length });
});

// GET task by id
app.get('/api/tasks/:id', (req, res) => {
  const task = store.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
  res.json({ success: true, data: task });
});

// POST create task
app.post('/api/tasks', [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  body('assignee').trim().notEmpty().withMessage('Assignee is required'),
  body('tag').isIn([...VALID_TAGS]).withMessage('Invalid tag'),
  body('priority').isIn([...VALID_PRIORITIES]).withMessage('Invalid priority'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const task = {
    id: String(store.nextId++),
    title: sanitize(req.body.title),
    assignee: sanitize(req.body.assignee),
    tag: req.body.tag,
    priority: req.body.priority,
    status: 'todo',
    description: sanitize(req.body.description || ''),
    createdAt: new Date().toISOString(),
  };
  store.tasks.push(task);
  res.status(201).json({ success: true, data: task });
});

// PUT update task status
app.put('/api/tasks/:id', [
  body('status').isIn([...VALID_STATUSES]).withMessage('Invalid status'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const task = store.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

  if (req.body.status) task.status = req.body.status;
  if (req.body.title) task.title = sanitize(req.body.title);
  task.updatedAt = new Date().toISOString();
  res.json({ success: true, data: task });
});

// DELETE task
app.delete('/api/tasks/:id', (req, res) => {
  const idx = store.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Task not found' });
  store.tasks.splice(idx, 1);
  res.json({ success: true, message: 'Task deleted' });
});

// ── API: Messages ─────────────────────────────────────────────────────────────
app.get('/api/messages', (_req, res) => {
  res.json({ success: true, data: store.messages });
});

app.post('/api/messages', [
  body('user').trim().notEmpty().isLength({ max: 100 }),
  body('text').trim().notEmpty().isLength({ max: 1000 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const msg = {
    id: String(Date.now()),
    user: sanitize(req.body.user),
    text: sanitize(req.body.text),
    timestamp: new Date().toISOString(),
  };
  store.messages.push(msg);
  res.status(201).json({ success: true, data: msg });
});

// ── API: Analytics ────────────────────────────────────────────────────────────
app.get('/api/analytics', (_req, res) => {
  const total = store.tasks.length;
  const done = store.tasks.filter(t => t.status === 'done').length;
  const inProgress = store.tasks.filter(t => t.status === 'progress').length;
  const todo = store.tasks.filter(t => t.status === 'todo').length;
  const byMember = {};
  store.tasks.forEach(t => {
    if (!byMember[t.assignee]) byMember[t.assignee] = { total: 0, done: 0 };
    byMember[t.assignee].total++;
    if (t.status === 'done') byMember[t.assignee].done++;
  });
  res.json({ success: true, data: { total, done, inProgress, todo, completionRate: total ? Math.round(done / total * 100) : 0, byMember } });
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

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TeamFlow running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});

module.exports = app;
