const request = require('supertest');
const { app } = require('../server');

test('GET /health returns 200 with ok status and uptime', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
  expect(typeof res.body.uptime).toBe('number');
});

test('unhandled synchronous errors return 500 JSON', async () => {
  const express = require('express');
  const errorHandler = require('../middleware/errorHandler');
  const testApp = express();
  testApp.get('/boom', (req, res) => { throw new Error('unexpected'); });
  testApp.use(errorHandler);
  const res = await request(testApp).get('/boom');
  expect(res.status).toBe(500);
  expect(res.body.error).toBe('Internal server error');
});
