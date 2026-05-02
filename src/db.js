'use strict';

/**
 * @fileoverview Database abstraction layer for TeamFlow.
 *
 * Provides a unified interface over two backends:
 *  - **Test environment** (`NODE_ENV=test`): fast synchronous in-memory store.
 *  - **Production / development**: Firebase Firestore via the Admin SDK.
 *
 * All public functions return Promises and are safe to `await`.
 * Write operations automatically invalidate the in-memory response cache.
 */

const {
  DEFAULT_MSG_LIMIT,
  MAX_MSG_LIMIT,
  DEFAULT_PAGE,
  MAX_ACTIVITIES,
} = require('./config');
const cache = require('./cache');

/** @type {boolean} True when running under Jest / other test runners. */
const IS_TEST = process.env.NODE_ENV === 'test';

/* ── In-memory store (test only) ─────────────────────────────────────────── */

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} status      - 'todo' | 'progress' | 'done'
 * @property {string} assignee
 * @property {string} tag
 * @property {string} priority    - 'low' | 'medium' | 'high'
 * @property {string} createdAt   - ISO 8601 timestamp
 * @property {string} [updatedAt] - ISO 8601 timestamp (set on update)
 * @property {string} [description]
 */

/**
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} user
 * @property {string} text
 * @property {string} timestamp - ISO 8601 timestamp
 */

/**
 * @typedef {Object} Activity
 * @property {string} id
 * @property {string} text
 * @property {string} color     - Hex colour string e.g. '#1D9E75'
 * @property {string} timestamp - ISO 8601 timestamp
 */

/**
 * @typedef {Object} Analytics
 * @property {number} total
 * @property {number} done
 * @property {number} inProgress
 * @property {number} todo
 * @property {number} completionRate  - 0-100
 * @property {Object.<string, {total: number, done: number}>} byMember
 */

const memStore = {
  tasks: [
    { id: '1', title: 'Design wireframes', status: 'todo',     tag: 'design',   assignee: 'Nisha P',   priority: 'high',   createdAt: new Date().toISOString() },
    { id: '2', title: 'Set up Cloud Run',  status: 'progress', tag: 'backend',  assignee: 'Karthik A', priority: 'high',   createdAt: new Date().toISOString() },
    { id: '3', title: 'API endpoints',     status: 'progress', tag: 'backend',  assignee: 'Rajan S',   priority: 'medium', createdAt: new Date().toISOString() },
    { id: '4', title: 'Auth integration',  status: 'done',     tag: 'feature',  assignee: 'Karthik A', priority: 'high',   createdAt: new Date().toISOString() },
    { id: '5', title: 'UI components',     status: 'todo',     tag: 'frontend', assignee: 'Meera M',   priority: 'medium', createdAt: new Date().toISOString() },
  ],
  messages: [
    { id: '1', user: 'Karthik A', text: 'Cloud Run is live!',           timestamp: new Date().toISOString() },
    { id: '2', user: 'Nisha P',   text: 'Wireframes ready for review.', timestamp: new Date().toISOString() },
  ],
  activities: [
    { id: '1', text: 'Karthik A moved "Auth flow" to In Progress', color: '#185FA5', timestamp: new Date().toISOString() },
    { id: '2', text: 'Nisha P completed "Brand palette"',           color: '#1D9E75', timestamp: new Date().toISOString() },
  ],
  nextId: 6,
};

/* ── Firestore helpers ───────────────────────────────────────────────────── */

/**
 * Returns the Firestore database instance (lazy-initialised).
 *
 * @returns {import('@google-cloud/firestore').Firestore}
 */
function firestoreDb() {
  const { getDb } = require('./firebase');
  return getDb();
}

/**
 * Converts a Firestore document snapshot to a plain object with an `id` field.
 *
 * @param {import('@google-cloud/firestore').DocumentSnapshot} doc
 * @returns {Object}
 */
function docToObj(doc) {
  return { id: doc.id, ...doc.data() };
}

/* ══════════════════════════════════════════════════════════════════════════
   TASKS
══════════════════════════════════════════════════════════════════════════ */

/**
 * Retrieves all tasks ordered by creation date ascending.
 *
 * @returns {Promise<Task[]>}
 */
async function getAllTasks() {
  if (IS_TEST) return [...memStore.tasks];
  return cache.getOrFetch('tasks', async () => {
    const snap = await firestoreDb()
      .collection('tasks')
      .orderBy('createdAt', 'asc')
      .get();
    return snap.docs.map(docToObj);
  });
}

/**
 * Retrieves a single task by its Firestore document ID.
 *
 * @param {string} id - Firestore document ID.
 * @returns {Promise<Task|null>} The task, or `null` if not found.
 */
async function getTaskById(id) {
  if (IS_TEST) return memStore.tasks.find(t => t.id === id) || null;
  const doc = await firestoreDb().collection('tasks').doc(id).get();
  return doc.exists ? docToObj(doc) : null;
}

/**
 * Creates a new task document in Firestore.
 *
 * @param {Omit<Task, 'id'|'createdAt'>} data - Task fields (status defaults to 'todo').
 * @returns {Promise<Task>} The created task including its generated `id`.
 */
async function createTask(data) {
  if (IS_TEST) {
    const task = { id: String(memStore.nextId++), ...data, createdAt: new Date().toISOString() };
    memStore.tasks.push(task);
    return task;
  }
  const ref  = firestoreDb().collection('tasks').doc();
  const task = { id: ref.id, ...data, createdAt: new Date().toISOString() };
  await ref.set(task);
  cache.invalidate('tasks', 'analytics');
  return task;
}

/**
 * Updates specific fields on an existing task.
 *
 * @param {string} id      - Firestore document ID.
 * @param {Partial<Task>}  updates - Fields to update.
 * @returns {Promise<Task|null>} The updated task, or `null` if not found.
 */
async function updateTask(id, updates) {
  if (IS_TEST) {
    const task = memStore.tasks.find(t => t.id === id);
    if (!task) return null;
    Object.assign(task, updates, { updatedAt: new Date().toISOString() });
    return task;
  }
  const ref = firestoreDb().collection('tasks').doc(id);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const updated = { ...updates, updatedAt: new Date().toISOString() };
  await ref.update(updated);
  cache.invalidate('tasks', 'analytics');
  return { id, ...doc.data(), ...updated };
}

/**
 * Deletes a task document from Firestore.
 *
 * @param {string} id - Firestore document ID.
 * @returns {Promise<boolean>} `true` if deleted, `false` if the task was not found.
 */
async function deleteTask(id) {
  if (IS_TEST) {
    const idx = memStore.tasks.findIndex(t => t.id === id);
    if (idx === -1) return false;
    memStore.tasks.splice(idx, 1);
    return true;
  }
  const ref = firestoreDb().collection('tasks').doc(id);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  cache.invalidate('tasks', 'analytics');
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════
   MESSAGES
══════════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} PaginatedMessages
 * @property {Message[]} data  - Page of messages.
 * @property {number}    total - Total message count.
 */

/**
 * Retrieves a paginated page of messages ordered by timestamp ascending.
 *
 * @param {Object} [opts]
 * @param {number} [opts.limit=50]  - Max messages per page (1–200).
 * @param {number} [opts.page=1]    - 1-based page number.
 * @returns {Promise<PaginatedMessages>}
 */
async function getAllMessages({ limit = DEFAULT_MSG_LIMIT, page = DEFAULT_PAGE } = {}) {
  const cap    = Math.min(Math.max(1, Number(limit) || DEFAULT_MSG_LIMIT), MAX_MSG_LIMIT);
  const pg     = Math.max(1, Number(page) || DEFAULT_PAGE);
  const offset = (pg - 1) * cap;

  if (IS_TEST) {
    const all = [...memStore.messages];
    return { data: all.slice(offset, offset + cap), total: all.length };
  }

  const [countSnap, snap] = await Promise.all([
    firestoreDb().collection('messages').count().get(),
    firestoreDb()
      .collection('messages')
      .orderBy('timestamp', 'asc')
      .offset(offset)
      .limit(cap)
      .get(),
  ]);

  return { data: snap.docs.map(docToObj), total: countSnap.data().count };
}

/**
 * Persists a new chat message.
 *
 * @param {{ user: string, text: string }} data
 * @returns {Promise<Message>} The created message.
 */
async function createMessage(data) {
  if (IS_TEST) {
    const msg = { id: String(Date.now()), ...data, timestamp: new Date().toISOString() };
    memStore.messages.push(msg);
    return msg;
  }
  const ref = firestoreDb().collection('messages').doc();
  const msg = { id: ref.id, ...data, timestamp: new Date().toISOString() };
  await ref.set(msg);
  return msg;
}

/* ══════════════════════════════════════════════════════════════════════════
   ACTIVITIES
══════════════════════════════════════════════════════════════════════════ */

/**
 * Retrieves the most recent activity log entries (newest first).
 *
 * @returns {Promise<Activity[]>} Up to {@link MAX_ACTIVITIES} entries.
 */
async function getAllActivities() {
  if (IS_TEST) return [...memStore.activities].reverse().slice(0, MAX_ACTIVITIES);
  const snap = await firestoreDb()
    .collection('activities')
    .orderBy('timestamp', 'desc')
    .limit(MAX_ACTIVITIES)
    .get();
  return snap.docs.map(docToObj);
}

/**
 * Persists a new activity log entry.
 *
 * @param {{ text: string, color: string }} data
 * @returns {Promise<Activity>} The created activity entry.
 */
async function createActivity(data) {
  if (IS_TEST) {
    const act = { id: String(Date.now()), ...data, timestamp: new Date().toISOString() };
    memStore.activities.push(act);
    return act;
  }
  const ref = firestoreDb().collection('activities').doc();
  const act = { id: ref.id, ...data, timestamp: new Date().toISOString() };
  await ref.set(act);
  return act;
}

/* ══════════════════════════════════════════════════════════════════════════
   ANALYTICS
══════════════════════════════════════════════════════════════════════════ */

/**
 * Computes aggregated team analytics from the current task list.
 * Results are derived in a single pass for efficiency (no separate collection).
 *
 * @returns {Promise<Analytics>}
 */
async function getAnalytics() {
  return cache.getOrFetch('analytics', async () => {
    const tasks      = await getAllTasks();
    const total      = tasks.length;
    const done       = tasks.filter(t => t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'progress').length;
    const todo       = total - done - inProgress;

    /** @type {Object.<string, {total: number, done: number}>} */
    const byMember = {};
    for (const t of tasks) {
      if (!byMember[t.assignee]) byMember[t.assignee] = { total: 0, done: 0 };
      byMember[t.assignee].total++;
      if (t.status === 'done') byMember[t.assignee].done++;
    }

    return {
      total,
      done,
      inProgress,
      todo,
      completionRate: total ? Math.round((done / total) * 100) : 0,
      byMember,
    };
  });
}

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getAllMessages,
  createMessage,
  getAllActivities,
  createActivity,
  getAnalytics,
};
