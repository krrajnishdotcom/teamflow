/**
 * Database abstraction layer
 * - In test env (NODE_ENV=test): uses fast in-memory store
 * - In all other envs: uses Firebase Firestore (real Google Cloud DB)
 */

'use strict';

const IS_TEST = process.env.NODE_ENV === 'test';

/* ── In-memory fallback (used in tests only) ──────────────────────────── */
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
  nextId: 6,
};

/* ── Firestore helpers ───────────────────────────────────────────────────── */
function firestoreDb() {
  const { getDb } = require('./firebase');
  return getDb();
}

function docToObj(doc) {
  return { id: doc.id, ...doc.data() };
}

/* ══════════════════════════════════════════════════════════════════════════
   TASKS
══════════════════════════════════════════════════════════════════════════ */
async function getAllTasks() {
  if (IS_TEST) return [...memStore.tasks];
  const snap = await firestoreDb().collection('tasks').orderBy('createdAt', 'asc').get();
  return snap.docs.map(docToObj);
}

async function getTaskById(id) {
  if (IS_TEST) return memStore.tasks.find(t => t.id === id) || null;
  const doc = await firestoreDb().collection('tasks').doc(id).get();
  return doc.exists ? docToObj(doc) : null;
}

async function createTask(data) {
  if (IS_TEST) {
    const task = { id: String(memStore.nextId++), ...data, createdAt: new Date().toISOString() };
    memStore.tasks.push(task);
    return task;
  }
  const ref = firestoreDb().collection('tasks').doc();
  const task = { id: ref.id, ...data, createdAt: new Date().toISOString() };
  await ref.set(task);
  return task;
}

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
  return { id, ...doc.data(), ...updated };
}

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
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════
   MESSAGES
══════════════════════════════════════════════════════════════════════════ */
async function getAllMessages() {
  if (IS_TEST) return [...memStore.messages];
  const snap = await firestoreDb().collection('messages').orderBy('timestamp', 'asc').limit(100).get();
  return snap.docs.map(docToObj);
}

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
   ANALYTICS (computed, no separate collection needed)
══════════════════════════════════════════════════════════════════════════ */
async function getAnalytics() {
  const tasks = await getAllTasks();
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const inProgress = tasks.filter(t => t.status === 'progress').length;
  const todo = tasks.filter(t => t.status === 'todo').length;
  const byMember = {};
  tasks.forEach(t => {
    if (!byMember[t.assignee]) byMember[t.assignee] = { total: 0, done: 0 };
    byMember[t.assignee].total++;
    if (t.status === 'done') byMember[t.assignee].done++;
  });
  return { total, done, inProgress, todo, completionRate: total ? Math.round(done / total * 100) : 0, byMember };
}

module.exports = { getAllTasks, getTaskById, createTask, updateTask, deleteTask, getAllMessages, createMessage, getAnalytics };
