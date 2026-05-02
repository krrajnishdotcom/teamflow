/**
 * TeamFlow API Tests
 * Coverage: Tasks CRUD, Messages (with pagination), Analytics, AI Suggest,
 *           Activities, Export, Health, Security
 * 35 tests total
 */

'use strict';

const request = require('supertest');
const app = require('../server');

describe('Health Check', () => {
  it('GET /health returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.service).toBe('teamflow');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /health includes database info', async () => {
    const res = await request(app).get('/health');
    expect(res.body.database).toBeDefined();
  });
});

describe('Tasks API', () => {
  let createdTaskId;

  it('GET /api/tasks returns task list', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.count).toBeGreaterThan(0);
  });

  it('POST /api/tasks creates a valid task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test task', assignee: 'Test User', tag: 'feature', priority: 'medium' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Test task');
    expect(res.body.data.status).toBe('todo');
    createdTaskId = res.body.data.id;
  });

  it('POST /api/tasks rejects empty title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '', assignee: 'User', tag: 'feature', priority: 'low' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/tasks rejects missing assignee', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'No Assignee Task', tag: 'bug', priority: 'low' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/tasks rejects invalid tag', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', assignee: 'User', tag: 'invalid_tag', priority: 'low' });
    expect(res.status).toBe(400);
  });

  it('GET /api/tasks/:id returns specific task', async () => {
    const res = await request(app).get(`/api/tasks/${createdTaskId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdTaskId);
  });

  it('GET /api/tasks/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/tasks/nonexistent-999');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('PUT /api/tasks/:id updates task status', async () => {
    const res = await request(app)
      .put(`/api/tasks/${createdTaskId}`)
      .send({ status: 'progress' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('progress');
  });

  it('PUT /api/tasks/:id rejects invalid status', async () => {
    const res = await request(app)
      .put(`/api/tasks/${createdTaskId}`)
      .send({ status: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('DELETE /api/tasks/:id removes a task', async () => {
    const res = await request(app).delete(`/api/tasks/${createdTaskId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('DELETE /api/tasks/:id returns 404 after deletion', async () => {
    const res = await request(app).delete(`/api/tasks/${createdTaskId}`);
    expect(res.status).toBe(404);
  });
});

describe('Messages API', () => {
  it('GET /api/messages returns messages with pagination metadata', async () => {
    const res = await request(app).get('/api/messages');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Pagination envelope
    expect(res.body.pagination).toBeDefined();
    expect(typeof res.body.pagination.total).toBe('number');
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(50);
  });

  it('GET /api/messages respects ?limit and ?page', async () => {
    const res = await request(app).get('/api/messages?limit=1&page=1');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.limit).toBe(1);
    expect(res.body.pagination.page).toBe(1);
  });

  it('GET /api/messages rejects out-of-range limit', async () => {
    const res = await request(app).get('/api/messages?limit=999');
    expect(res.status).toBe(400);
  });

  it('POST /api/messages creates a message', async () => {
    const res = await request(app)
      .post('/api/messages')
      .send({ user: 'Karthik A', text: 'Hello team!' });
    expect(res.status).toBe(201);
    expect(res.body.data.text).toBe('Hello team!');
    expect(res.body.data.timestamp).toBeDefined();
  });

  it('POST /api/messages rejects empty text', async () => {
    const res = await request(app)
      .post('/api/messages')
      .send({ user: 'Karthik A', text: '' });
    expect(res.status).toBe(400);
  });
});

describe('Activities API', () => {
  let createdActivityId;

  it('GET /api/activities returns activity list', async () => {
    const res = await request(app).get('/api/activities');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/activities creates an activity', async () => {
    const res = await request(app)
      .post('/api/activities')
      .send({ text: '"Setup CI" moved to Done', color: '#1D9E75' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.text).toBe('"Setup CI" moved to Done');
    expect(res.body.data.timestamp).toBeDefined();
    createdActivityId = res.body.data.id;
  });

  it('POST /api/activities uses default color when none supplied', async () => {
    const res = await request(app)
      .post('/api/activities')
      .send({ text: 'New task created by Nisha P' });
    expect(res.status).toBe(201);
    expect(res.body.data.color).toBe('#1D9E75');
  });

  it('POST /api/activities rejects empty text', async () => {
    const res = await request(app)
      .post('/api/activities')
      .send({ text: '' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/activities rejects invalid color format', async () => {
    const res = await request(app)
      .post('/api/activities')
      .send({ text: 'Task done', color: 'red' });
    expect(res.status).toBe(400);
  });

  it('GET /api/activities reflects newly created activity', async () => {
    const res = await request(app).get('/api/activities');
    const ids = res.body.data.map(a => a.id);
    expect(ids).toContain(createdActivityId);
  });
});

describe('Analytics API', () => {
  it('GET /api/analytics returns stats', async () => {
    const res = await request(app).get('/api/analytics');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.total).toBe('number');
    expect(typeof res.body.data.completionRate).toBe('number');
    expect(res.body.data.completionRate).toBeGreaterThanOrEqual(0);
    expect(res.body.data.completionRate).toBeLessThanOrEqual(100);
  });

  it('GET /api/analytics byMember is an object', async () => {
    const res = await request(app).get('/api/analytics');
    expect(typeof res.body.data.byMember).toBe('object');
    expect(res.body.data.byMember).not.toBeNull();
  });
});

describe('AI Suggest API', () => {
  it('POST /api/ai/suggest returns a recommendation with poweredBy field', async () => {
    const res = await request(app)
      .post('/api/ai/suggest')
      .send({ title: 'Build login page', tag: 'frontend' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestion.assignee).toBeDefined();
    expect(res.body.suggestion.confidence).toBeGreaterThan(0);
    expect(res.body.suggestion.reason).toBeDefined();
    expect(Array.isArray(res.body.suggestion.alternates)).toBe(true);
    // poweredBy must always be the TeamFlow AI engine
    expect(res.body.suggestion.poweredBy).toBe('teamflow-ai');
  }, 15000);

  it('POST /api/ai/suggest rejects missing title', async () => {
    const res = await request(app)
      .post('/api/ai/suggest')
      .send({ tag: 'backend' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/ai/suggest includes alternates list', async () => {
    const res = await request(app)
      .post('/api/ai/suggest')
      .send({ title: 'Fix bug in auth', tag: 'bug' });
    expect(res.body.suggestion.alternates.length).toBeGreaterThan(0);
  }, 15000);
});

describe('Export API', () => {
  it('GET /api/export returns CSV', async () => {
    const res = await request(app).get('/api/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('id,title,status');
  });
});

describe('Security', () => {
  it('sets security headers via helmet', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('sanitizes XSS in task title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '<script>alert(1)</script>', assignee: 'User', tag: 'bug', priority: 'low' });
    if (res.status === 201) {
      expect(res.body.data.title).not.toContain('<script>');
    }
  });

  it('sanitizes XSS in activity text', async () => {
    const res = await request(app)
      .post('/api/activities')
      .send({ text: '<img src=x onerror=alert(1)> done' });
    if (res.status === 201) {
      expect(res.body.data.text).not.toContain('<img');
    }
  });
});
