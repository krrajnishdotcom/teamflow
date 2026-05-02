'use strict';

/**
 * @fileoverview Simple in-memory TTL cache for TeamFlow API responses.
 *
 * Reduces Firestore reads for hot endpoints (tasks, analytics) by serving
 * cached results within a configurable time-to-live window. Writes
 * automatically invalidate affected cache entries so data stays consistent.
 *
 * @example
 * const cache = require('./cache');
 * const data  = await cache.getOrFetch('tasks', () => db.getAllTasks(), 30_000);
 * cache.invalidate('tasks');
 */

const { CACHE_TTL_MS } = require('./config');

/**
 * @typedef {Object} CacheEntry
 * @property {*}      value     - Cached value.
 * @property {number} expiresAt - Unix timestamp (ms) when the entry expires.
 */

/** @type {Map<string, CacheEntry>} */
const _store = new Map();

/**
 * Returns a cached value if still fresh, otherwise calls `fetchFn`,
 * stores the result, and returns it.
 *
 * @template T
 * @param {string}           key      - Cache key.
 * @param {function(): Promise<T>} fetchFn - Async function to fetch fresh data.
 * @param {number}           [ttl]    - Time-to-live in ms (default: CACHE_TTL_MS).
 * @returns {Promise<T>}
 */
async function getOrFetch(key, fetchFn, ttl = CACHE_TTL_MS) {
  const now   = Date.now();
  const entry = _store.get(key);
  if (entry && entry.expiresAt > now) {
    return entry.value;
  }
  const value = await fetchFn();
  _store.set(key, { value, expiresAt: now + ttl });
  return value;
}

/**
 * Removes one or more entries from the cache.
 *
 * @param {...string} keys - Cache key(s) to remove.
 * @returns {void}
 */
function invalidate(...keys) {
  keys.forEach(k => _store.delete(k));
}

/**
 * Clears the entire cache. Primarily used in tests.
 *
 * @returns {void}
 */
function flush() {
  _store.clear();
}

/**
 * Returns the number of entries currently in the cache (including stale).
 *
 * @returns {number}
 */
function size() {
  return _store.size;
}

module.exports = { getOrFetch, invalidate, flush, size };
