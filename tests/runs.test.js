// tests/runs.test.js
const request = require('supertest');
const express = require('express');
const { createDb } = require('../db');
const checklistsRouter = require('../routes/checklists');
const runsRouter = require('../routes/runs');

function makeApp(db, notify = async () => {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/checklists', checklistsRouter(db));
  app.use('/api/runs', runsRouter(db, notify));
  return app;
}

let db, app, checklistId;
beforeEach(async () => {
  db = createDb(':memory:');
  app = makeApp(db);
  const res = await request(app).post('/api/checklists').send({
    name: 'Test', steps: [{ id: 's1', text: 'Do it', allow_note: false, skippable: false }]
  });
  checklistId = res.body.id;
});
afterEach(() => db.close());

test('POST /api/runs creates a run', async () => {
  const res = await request(app).post('/api/runs').send({ checklist_id: checklistId, runner_name: 'Alice' });
  expect(res.status).toBe(201);
  expect(res.body.runner_name).toBe('Alice');
  expect(res.body.completed_at).toBeNull();
  expect(res.body.responses).toEqual([]);
});

test('POST /api/runs returns 400 for missing checklist_id', async () => {
  expect((await request(app).post('/api/runs').send({})).status).toBe(400);
});

test('POST /api/runs returns 404 for unknown checklist', async () => {
  expect((await request(app).post('/api/runs').send({ checklist_id: 'nope' })).status).toBe(404);
});

test('PUT /api/runs/:id updates responses', async () => {
  const { body: run } = await request(app).post('/api/runs').send({ checklist_id: checklistId });
  const responses = [{ step_id: 's1', answer: 'yes', note: '', answered_at: new Date().toISOString() }];
  const res = await request(app).put(`/api/runs/${run.id}`).send({ responses });
  expect(res.status).toBe(200);
  expect(res.body.responses[0].answer).toBe('yes');
});

test('PUT /api/runs/:id calls notify once on first completion', async () => {
  const calls = [];
  const db2 = createDb(':memory:');
  const app2 = makeApp(db2, async (cl, run) => calls.push({ cl, run }));
  const { body: cl } = await request(app2).post('/api/checklists').send({ name: 'X', steps: [] });
  const { body: run } = await request(app2).post('/api/runs').send({ checklist_id: cl.id });
  await request(app2).put(`/api/runs/${run.id}`).send({ completed_at: new Date().toISOString(), responses: [] });
  expect(calls).toHaveLength(1);
  await request(app2).put(`/api/runs/${run.id}`).send({ completed_at: new Date().toISOString(), responses: [] });
  expect(calls).toHaveLength(1); // no second notify
  db2.close();
});

test('GET /api/runs?checklist_id= lists runs', async () => {
  await request(app).post('/api/runs').send({ checklist_id: checklistId, runner_name: 'Bob' });
  await request(app).post('/api/runs').send({ checklist_id: checklistId, runner_name: 'Carol' });
  const res = await request(app).get(`/api/runs?checklist_id=${checklistId}`);
  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(2);
});
