const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const adminAuth = require('../middleware/adminAuth');

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', adminAuth, (req, res) => res.json({ ok: true }));
  return app;
}

afterEach(() => { delete process.env.ADMIN_PASSWORD; });

test('allows request when ADMIN_PASSWORD is not set', async () => {
  delete process.env.ADMIN_PASSWORD;
  const res = await request(makeApp()).get('/protected');
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});

test('returns 401 when ADMIN_PASSWORD is set and no cookie present', async () => {
  process.env.ADMIN_PASSWORD = 'secret';
  const res = await request(makeApp()).get('/protected');
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('Unauthorized');
});

test('allows request with correct admin_session cookie', async () => {
  process.env.ADMIN_PASSWORD = 'secret';
  const res = await request(makeApp())
    .get('/protected')
    .set('Cookie', 'admin_session=secret');
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});

test('returns 401 with wrong cookie value', async () => {
  process.env.ADMIN_PASSWORD = 'secret';
  const res = await request(makeApp())
    .get('/protected')
    .set('Cookie', 'admin_session=wrong');
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('Unauthorized');
});
