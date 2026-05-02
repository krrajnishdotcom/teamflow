'use strict';

/**
 * @fileoverview TeamFlow — Team Collaboration Tool
 *
 * Production-ready Express server entry point.
 * Core responsibilities:
 *  - Middleware orchestration (Security, Compression, Rate Limiting)
 *  - Static file serving
 *  - API route mounting
 *  - Error handling
 *
 * Built for Prompt Wars Chennai Hackathon by hack2skill.
 * Powered by Google Cloud Run, Firebase Firestore, and Vertex AI / Gemini.
 */

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compress   = require('compression');
const path       = require('path');

// Internal modules
const cfg        = require('./src/config');
const routes     = require('./src/routes');

const app = express();

// ── Global Middleware ─────────────────────────────────────────────────────────

app.use(compress()); // Gzip compression
app.use(helmet({    // Security headers & CSP
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'https://www.gstatic.com', 'https://www.googleapis.com'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.firebaseio.com', 'https://*.firebaseapp.com'],
    },
  },
}));

app.use(cors({      // CORS management
  origin:  process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

app.use(express.json({ limit: cfg.BODY_SIZE_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: cfg.BODY_SIZE_LIMIT }));

// ── Health Check (Infrastructure level) ───────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status:    'healthy',
    service:   'teamflow',
    database:  process.env.NODE_ENV === 'test' ? 'in-memory' : 'firestore',
    timestamp: new Date().toISOString(),
  });
});

// ── Static Assets ─────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag:   true
}));

// ── API Routes ────────────────────────────────────────────────────────────────

app.use('/api', routes);

// ── Error Handling ────────────────────────────────────────────────────────────

/**
 * 404 handler for unmatched routes.
 */
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

/**
 * Global error handler for unhandled exceptions.
 */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Fatal Error]', err.stack);
  res.status(500).json({
    success: false,
    error:   'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ── Server Lifecycle ──────────────────────────────────────────────────────────

if (require.main === module) {
  const server = app.listen(cfg.PORT, () => {
    const mode = process.env.NODE_ENV === 'test' ? 'in-memory' : 'Firebase Firestore';
    console.log(`\x1b[32m✔ TeamFlow Server successfully started on port ${cfg.PORT}\x1b[0m`);
    console.log(`  Mode:     ${mode}`);
    console.log(`  Health:   http://localhost:${cfg.PORT}/health`);
  });

  // Graceful shutdown for Cloud Run
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => console.log('HTTP server closed'));
  });
}

module.exports = app;
