// tests/checklists.test.js
const request = require('supertest');
const express = require('express');
const { createDb } = require('../db');
const checklistsRouter = require('../routes/checklists');

let app, db;
beforeEach(() => {
  db = createDb(':memory:');
  app = express();
  app.use(express.json());
  app.use('/api/checklists', checklistsRouter(db));
});
afterEach(() => db.close());

const sample = {
  name: 'Morning Routine', description: 'Start right',
  steps: [
    { id: 's1', text: 'Check email', allow_note: false, skippable: false },
    { id: 's2', text: 'Review calendar', allow_note: true, skippable: true }
  ],
  slack_webhook_url: 'https://hooks.slack.com/test',
  notification_email: 'test@example.com'
};

test('POST creates a checklist', async () => {
  const res = await request(app).post('/api/checklists').send(sample);
  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
  expect(res.body.name).toBe('Morning Routine');
  expect(res.body.steps).toHaveLength(2);
});

test('GET / lists checklists with step_count and run_count', async () => {
  await request(app).post('/api/checklists').send(sample);
  const res = await request(app).get('/api/checklists');
  expect(res.status).toBe(200);
  expect(res.body[0].step_count).toBe(2);
  expect(res.body[0].run_count).toBe(0);
});

test('GET /:id returns full checklist', async () => {
  const { body: cl } = await request(app).post('/api/checklists').send(sample);
  const res = await request(app).get(`/api/checklists/${cl.id}`);
  expect(res.status).toBe(200);
  expect(res.body.steps[0].text).toBe('Check email');
});

test('GET /:id returns 404 for unknown id', async () => {
  expect((await request(app).get('/api/checklists/nope')).status).toBe(404);
});

test('PUT /:id updates a checklist', async () => {
  const { body: cl } = await request(app).post('/api/checklists').send(sample);
  const res = await request(app).put(`/api/checklists/${cl.id}`)
    .send({ name: 'Updated', description: '', steps: [], slack_webhook_url: '', notification_email: '' });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Updated');
});

test('DELETE /:id deletes checklist', async () => {
  const { body: cl } = await request(app).post('/api/checklists').send(sample);
  expect((await request(app).delete(`/api/checklists/${cl.id}`)).status).toBe(204);
  expect((await request(app).get(`/api/checklists/${cl.id}`)).status).toBe(404);
});

test('POST rejects name over 200 characters', async () => {
  const res = await request(app).post('/api/checklists').send({ name: 'a'.repeat(201) });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/200/);
});

test('POST rejects steps that is not an array', async () => {
  const res = await request(app).post('/api/checklists').send({ name: 'Test', steps: 'invalid' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/array/);
});

test('POST rejects step with empty text', async () => {
  const res = await request(app).post('/api/checklists').send({
    name: 'Test',
    steps: [{ id: 's1', text: '   ', allow_note: false, skippable: false }]
  });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/text is required/);
});

test('POST rejects slack_webhook_url not starting with https://', async () => {
  const res = await request(app).post('/api/checklists').send({
    name: 'Test', slack_webhook_url: 'http://hooks.slack.com/bad'
  });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/https/);
});

test('POST rejects invalid notification_email', async () => {
  const res = await request(app).post('/api/checklists').send({
    name: 'Test', notification_email: 'not-an-email'
  });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/email/);
});

test('POST accepts valid checklist with all optional fields', async () => {
  const res = await request(app).post('/api/checklists').send({
    name: 'Valid',
    steps: [{ id: 's1', text: 'Do the thing', allow_note: false, skippable: false }],
    slack_webhook_url: 'https://hooks.slack.com/valid',
    notification_email: 'user@example.com'
  });
  expect(res.status).toBe(201);
});
