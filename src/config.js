'use strict';

/**
 * @fileoverview Centralized configuration constants for TeamFlow.
 * All magic values live here — import from this module instead of
 * scattering literals throughout the codebase.
 */

/** Google Cloud / Firebase project identifiers */
const PROJECT_ID       = process.env.GCLOUD_PROJECT        || 'teamflow-495105';
const FIREBASE_AUTH_PROJECT = process.env.FIREBASE_AUTH_PROJECT || 'teamflow-f7a87';

/** HTTP server */
const PORT = process.env.PORT || 8080;

/** Rate limiting */
const RATE_LIMIT_WINDOW_MS  = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX        = 100;

/** Pagination */
const DEFAULT_MSG_LIMIT = 50;
const MAX_MSG_LIMIT     = 200;
const DEFAULT_PAGE      = 1;
const MAX_ACTIVITIES    = 20;

/** Request body size */
const BODY_SIZE_LIMIT = '10kb';

/** Field length limits */
const MAX_TITLE_LEN    = 200;
const MAX_ASSIGNEE_LEN = 100;
const MAX_MSG_LEN      = 1000;
const MAX_ACTIVITY_LEN = 300;
const MAX_SANITIZE_LEN = 500;

/** Valid enum sets */
const VALID_STATUSES   = Object.freeze(new Set(['todo', 'progress', 'done']));
const VALID_TAGS       = Object.freeze(new Set(['design', 'backend', 'frontend', 'bug', 'feature']));
const VALID_PRIORITIES = Object.freeze(new Set(['low', 'medium', 'high']));

/** Default activity colour (brand green) */
const DEFAULT_ACTIVITY_COLOR = '#1D9E75';

/** Vertex AI */
const VERTEX_LOCATION = 'us-central1';
const VERTEX_MODEL    = 'gemini-1.5-flash-001';
const VERTEX_MAX_TOKENS = 128;
const VERTEX_TEMPERATURE = 0.2;

/** AI confidence scoring weights */
const AI_SKILL_MATCH_BONUS = 2;
const AI_LOAD_MAX_SCORE    = 4;
const AI_BASE_CONFIDENCE   = 60;
const AI_SCORE_MULTIPLIER  = 5;
const AI_MAX_CONFIDENCE    = 95;

/** Response cache TTL (milliseconds) */
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/** Team members with their skills (single source of truth) */
const TEAM_MEMBERS = Object.freeze([
  { name: 'Karthik A', skills: ['backend', 'feature'] },
  { name: 'Nisha P',   skills: ['design', 'frontend'] },
  { name: 'Rajan S',   skills: ['backend', 'bug']     },
  { name: 'Meera M',   skills: ['frontend', 'design'] },
]);

module.exports = {
  PROJECT_ID,
  FIREBASE_AUTH_PROJECT,
  PORT,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  DEFAULT_MSG_LIMIT,
  MAX_MSG_LIMIT,
  DEFAULT_PAGE,
  MAX_ACTIVITIES,
  BODY_SIZE_LIMIT,
  MAX_TITLE_LEN,
  MAX_ASSIGNEE_LEN,
  MAX_MSG_LEN,
  MAX_ACTIVITY_LEN,
  MAX_SANITIZE_LEN,
  VALID_STATUSES,
  VALID_TAGS,
  VALID_PRIORITIES,
  DEFAULT_ACTIVITY_COLOR,
  VERTEX_LOCATION,
  VERTEX_MODEL,
  VERTEX_MAX_TOKENS,
  VERTEX_TEMPERATURE,
  AI_SKILL_MATCH_BONUS,
  AI_LOAD_MAX_SCORE,
  AI_BASE_CONFIDENCE,
  AI_SCORE_MULTIPLIER,
  AI_MAX_CONFIDENCE,
  CACHE_TTL_MS,
  TEAM_MEMBERS,
};
