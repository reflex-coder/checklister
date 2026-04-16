# Checklister Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/Express web app where an admin creates step-by-step checklists and anyone can run them, with run history and Slack/email notifications on completion.

**Architecture:** Single Express server serves both the REST API and static HTML/JS frontend — no build step. SQLite (via better-sqlite3) stores checklists and runs. Notifications fire server-side on run completion. Deployed to Railway.

**Tech Stack:** Node.js 18+, Express 4, better-sqlite3, Nodemailer, uuid, dotenv, Jest + Supertest

---

## File Map

| File | Responsibility |
|---|---|
| `server.js` | Express app setup, route mounting, static file serving |
| `db.js` | SQLite connection, schema migration |
| `routes/checklists.js` | Checklist CRUD API — factory function takes `db` |
| `routes/runs.js` | Run lifecycle API — factory function takes `db, notify` |
| `notifications.js` | Slack webhook POST + Nodemailer email |
| `seed.js` | Seed Battle Stations checklist into DB |
| `public/style.css` | Shared CSS for runner and admin |
| `public/index.html` | Runner UI markup |
| `public/runner.js` | Runner frontend state machine |
| `public/admin.html` | Admin UI markup |
| `public/admin.js` | Admin frontend logic |
| `tests/db.test.js` | DB schema tests |
| `tests/checklists.test.js` | Checklist API tests |
| `tests/runs.test.js` | Run lifecycle tests |
| `tests/notifications.test.js` | Notification function tests |


---

### Task 1: Project Scaffold

**Files:** `package.json`, `.gitignore`, `.env.example`

- [ ] **Step 1: Init git and npm**
```bash
cd /Users/leow/projects/checklister
git init
npm init -y
```

- [ ] **Step 2: Install dependencies**
```bash
npm install express better-sqlite3 nodemailer uuid dotenv
npm install --save-dev jest supertest
```

- [ ] **Step 3: Update package.json scripts**

Replace the `scripts` section and add jest config:
```json
{
  "scripts": {
    "start": "node server.js",
    "test": "jest --runInBand",
    "seed": "node seed.js"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 4: Create .gitignore**
```
node_modules/
.env
data.db
.superpowers/
```

- [ ] **Step 5: Create .env.example**
```
PORT=3000
DB_PATH=./data.db
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Checklister <you@gmail.com>
BATTLE_STATIONS_SLACK_WEBHOOK=
BATTLE_STATIONS_EMAIL=
```

- [ ] **Step 6: Commit**
```bash
git add .
git commit -m "chore: project scaffold"
```

---

### Task 2: Database Module

**Files:** `db.js`, `tests/db.test.js`

- [ ] **Step 1: Write failing tests**
```js
// tests/db.test.js
const { createDb } = require('../db');

let db;
beforeEach(() => { db = createDb(':memory:'); });
afterEach(() => { db.close(); });

test('checklists table has correct columns', () => {
  const cols = db.prepare('PRAGMA table_info(checklists)').all().map(r => r.name);
  expect(cols).toEqual(expect.arrayContaining([
    'id','name','description','steps',
    'slack_webhook_url','notification_email','created_at','updated_at'
  ]));
});

test('runs table has correct columns', () => {
  const cols = db.prepare('PRAGMA table_info(runs)').all().map(r => r.name);
  expect(cols).toEqual(expect.arrayContaining([
    'id','checklist_id','runner_name','started_at','completed_at','responses'
  ]));
});

test('deleting checklist cascade-deletes its runs', () => {
  db.prepare(`INSERT INTO checklists (id,name,steps) VALUES ('cl1','T','[]')`).run();
  db.prepare(`INSERT INTO runs (id,checklist_id,responses) VALUES ('r1','cl1','[]')`).run();
  db.prepare(`DELETE FROM checklists WHERE id='cl1'`).run();
  expect(db.prepare(`SELECT * FROM runs WHERE id='r1'`).get()).toBeUndefined();
});
```

- [ ] **Step 2: Run — verify fail**
```bash
npx jest tests/db.test.js --no-coverage
```
Expected: FAIL — "Cannot find module '../db'"

- [ ] **Step 3: Implement db.js**
```js
// db.js
const Database = require('better-sqlite3');

function createDb(dbPath) {
  const path = dbPath || './data.db';
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.prepare(`CREATE TABLE IF NOT EXISTS checklists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    steps TEXT NOT NULL DEFAULT '[]',
    slack_webhook_url TEXT NOT NULL DEFAULT '',
    notification_email TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    checklist_id TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
    runner_name TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    responses TEXT NOT NULL DEFAULT '[]'
  )`).run();
  return db;
}

module.exports = { createDb };
```

- [ ] **Step 4: Run — verify pass**
```bash
npx jest tests/db.test.js --no-coverage
```
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**
```bash
git add db.js tests/db.test.js
git commit -m "feat: database module with schema migration"
```

---

### Task 3: Checklists API

**Files:** `routes/checklists.js`, `tests/checklists.test.js`

- [ ] **Step 1: Write failing tests**
```js
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
```

- [ ] **Step 2: Run — verify fail**
```bash
npx jest tests/checklists.test.js --no-coverage
```
Expected: FAIL — "Cannot find module '../routes/checklists'"

- [ ] **Step 3: Implement routes/checklists.js**
```js
// routes/checklists.js
const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');

module.exports = function checklistsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, COUNT(r.id) AS run_count
      FROM checklists c
      LEFT JOIN runs r ON r.checklist_id = c.id
      GROUP BY c.id ORDER BY c.created_at DESC
    `).all();
    res.json(rows.map(row => {
      const steps = JSON.parse(row.steps);
      return { ...row, steps, step_count: steps.length };
    }));
  });

  router.post('/', (req, res) => {
    const { name, description = '', steps = [], slack_webhook_url = '', notification_email = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = uuidv4();
    db.prepare(`INSERT INTO checklists (id,name,description,steps,slack_webhook_url,notification_email)
      VALUES (?,?,?,?,?,?)`)
      .run(id, name, description, JSON.stringify(steps), slack_webhook_url, notification_email);
    const row = db.prepare('SELECT * FROM checklists WHERE id=?').get(id);
    res.status(201).json({ ...row, steps: JSON.parse(row.steps) });
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM checklists WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json({ ...row, steps: JSON.parse(row.steps) });
  });

  router.put('/:id', (req, res) => {
    const { name, description = '', steps = [], slack_webhook_url = '', notification_email = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!db.prepare('SELECT id FROM checklists WHERE id=?').get(req.params.id))
      return res.status(404).json({ error: 'not found' });
    db.prepare(`UPDATE checklists SET name=?,description=?,steps=?,slack_webhook_url=?,notification_email=?,updated_at=datetime('now') WHERE id=?`)
      .run(name, description, JSON.stringify(steps), slack_webhook_url, notification_email, req.params.id);
    const row = db.prepare('SELECT * FROM checklists WHERE id=?').get(req.params.id);
    res.json({ ...row, steps: JSON.parse(row.steps) });
  });

  router.delete('/:id', (req, res) => {
    if (!db.prepare('SELECT id FROM checklists WHERE id=?').get(req.params.id))
      return res.status(404).json({ error: 'not found' });
    db.prepare('DELETE FROM checklists WHERE id=?').run(req.params.id);
    res.status(204).end();
  });

  return router;
};
```

- [ ] **Step 4: Run — verify pass**
```bash
npx jest tests/checklists.test.js --no-coverage
```
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**
```bash
git add routes/checklists.js tests/checklists.test.js
git commit -m "feat: checklists CRUD API"
```

---

### Task 4: Runs API

**Files:** `routes/runs.js`, `tests/runs.test.js`

- [ ] **Step 1: Write failing tests**
```js
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
```

- [ ] **Step 2: Run — verify fail**
```bash
npx jest tests/runs.test.js --no-coverage
```
Expected: FAIL — "Cannot find module '../routes/runs'"

- [ ] **Step 3: Implement routes/runs.js**
```js
// routes/runs.js
const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');

module.exports = function runsRouter(db, notify) {
  const router = Router();

  router.post('/', (req, res) => {
    const { checklist_id, runner_name = '' } = req.body;
    if (!checklist_id) return res.status(400).json({ error: 'checklist_id is required' });
    const checklist = db.prepare('SELECT * FROM checklists WHERE id=?').get(checklist_id);
    if (!checklist) return res.status(404).json({ error: 'checklist not found' });
    const id = uuidv4();
    db.prepare(`INSERT INTO runs (id,checklist_id,runner_name,responses) VALUES (?,?,?,'[]')`)
      .run(id, checklist_id, runner_name);
    const row = db.prepare('SELECT * FROM runs WHERE id=?').get(id);
    res.status(201).json({ ...row, responses: JSON.parse(row.responses) });
  });

  router.put('/:id', async (req, res) => {
    const run = db.prepare('SELECT * FROM runs WHERE id=?').get(req.params.id);
    if (!run) return res.status(404).json({ error: 'not found' });
    const wasComplete = !!run.completed_at;
    const responses = req.body.responses !== undefined ? JSON.stringify(req.body.responses) : run.responses;
    const completed_at = req.body.completed_at !== undefined ? req.body.completed_at : run.completed_at;
    db.prepare('UPDATE runs SET responses=?,completed_at=? WHERE id=?').run(responses, completed_at, run.id);
    const updated = db.prepare('SELECT * FROM runs WHERE id=?').get(run.id);
    const result = { ...updated, responses: JSON.parse(updated.responses) };
    if (!wasComplete && completed_at) {
      const cl = db.prepare('SELECT * FROM checklists WHERE id=?').get(run.checklist_id);
      notify({ ...cl, steps: JSON.parse(cl.steps) }, result).catch(err => console.error('notify error:', err));
    }
    res.json(result);
  });

  router.get('/', (req, res) => {
    if (!req.query.checklist_id) return res.status(400).json({ error: 'checklist_id required' });
    const rows = db.prepare('SELECT * FROM runs WHERE checklist_id=? ORDER BY started_at DESC').all(req.query.checklist_id);
    res.json(rows.map(r => ({ ...r, responses: JSON.parse(r.responses) })));
  });

  return router;
};
```

- [ ] **Step 4: Run — verify pass**
```bash
npx jest tests/runs.test.js --no-coverage
```
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**
```bash
git add routes/runs.js tests/runs.test.js
git commit -m "feat: runs API with lifecycle and notify hook"
```

---

### Task 5: Notifications Module

**Files:** `notifications.js`, `tests/notifications.test.js`

- [ ] **Step 1: Write failing tests**
```js
// tests/notifications.test.js
jest.mock('nodemailer');
const nodemailer = require('nodemailer');
const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'ok' });
nodemailer.createTransport.mockReturnValue({ sendMail: sendMailMock });

global.fetch = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

const { sendSlack, sendEmail, notifyRunComplete } = require('../notifications');

test('sendSlack posts JSON to webhook URL', async () => {
  await sendSlack('https://hooks.slack.com/test', 'Hello');
  expect(global.fetch).toHaveBeenCalledWith('https://hooks.slack.com/test',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Hello' }) }));
});

test('sendSlack is no-op when webhookUrl is empty', async () => {
  await sendSlack('', 'Hello');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('sendEmail calls nodemailer with correct fields', async () => {
  process.env.SMTP_HOST = 'smtp.test.com';
  process.env.SMTP_USER = 'u';
  process.env.SMTP_PASS = 'p';
  process.env.SMTP_FROM = 'From <f@t.com>';
  await sendEmail('to@test.com', 'Subj', '<p>Body</p>');
  expect(sendMailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'to@test.com', subject: 'Subj' }));
});

test('sendEmail is no-op when toEmail is empty', async () => {
  await sendEmail('', 'Subj', '<p>Body</p>');
  expect(sendMailMock).not.toHaveBeenCalled();
});

test('notifyRunComplete sends Slack and email', async () => {
  const checklist = {
    name: 'Test', slack_webhook_url: 'https://hooks.slack.com/x',
    notification_email: 'a@b.com',
    steps: [{ id: 's1', text: 'Do it', allow_note: false, skippable: false }]
  };
  const run = {
    runner_name: 'Alice', completed_at: '2026-04-16T10:00:00Z',
    responses: [{ step_id: 's1', answer: 'yes', note: '', answered_at: '2026-04-16T10:00:00Z' }]
  };
  await notifyRunComplete(checklist, run);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(sendMailMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run — verify fail**
```bash
npx jest tests/notifications.test.js --no-coverage
```
Expected: FAIL — "Cannot find module '../notifications'"

- [ ] **Step 3: Implement notifications.js**
```js
// notifications.js
require('dotenv').config();
const nodemailer = require('nodemailer');

async function sendSlack(webhookUrl, text) {
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
}

async function sendEmail(toEmail, subject, html) {
  if (!toEmail) return;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transport.sendMail({ from: process.env.SMTP_FROM || 'Checklister', to: toEmail, subject, html });
}

async function notifyRunComplete(checklist, run) {
  const yes = run.responses.filter(r => r.answer === 'yes').length;
  const no = run.responses.filter(r => r.answer === 'no').length;
  const skipped = run.responses.filter(r => r.answer === 'skip').length;
  const runner = run.runner_name || 'Anonymous';
  const slackText = `✅ *${checklist.name}* completed by ${runner}\n${run.responses.length} steps · Yes: ${yes} · No: ${no} · Skipped: ${skipped}`;
  const rows = run.responses.map(r => {
    const step = checklist.steps.find(s => s.id === r.step_id);
    const icon = r.answer === 'yes' ? '✓' : r.answer === 'no' ? '✗' : '–';
    const note = r.note ? `<br><span style="color:#888;font-size:12px;">${r.note}</span>` : '';
    return `<tr><td style="padding:6px 4px;color:#666;">${icon}</td><td style="padding:6px 8px;">${step ? step.text : r.step_id}${note}</td></tr>`;
  }).join('');
  const html = `<h2>${checklist.name} — Complete</h2><p>Runner: <strong>${runner}</strong> · ${new Date(run.completed_at).toLocaleString()}</p><table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">${rows}</table>`;
  await Promise.all([
    sendSlack(checklist.slack_webhook_url, slackText),
    sendEmail(checklist.notification_email, `✅ ${checklist.name} completed by ${runner}`, html)
  ]);
}

module.exports = { sendSlack, sendEmail, notifyRunComplete };
```

- [ ] **Step 4: Run — verify pass**
```bash
npx jest tests/notifications.test.js --no-coverage
```
Expected: PASS — 5 tests

- [ ] **Step 5: Run full suite**
```bash
npx jest --no-coverage
```
Expected: PASS — all 17 tests

- [ ] **Step 6: Commit**
```bash
git add notifications.js tests/notifications.test.js
git commit -m "feat: Slack and email notification module"
```

---

### Task 6: Server Entry Point + Seed

**Files:** `server.js`, `seed.js`, `public/.gitkeep`

- [ ] **Step 1: Create public/ directory**
```bash
mkdir -p /Users/leow/projects/checklister/public
touch /Users/leow/projects/checklister/public/.gitkeep
```

- [ ] **Step 2: Create server.js**
```js
// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const { createDb } = require('./db');
const checklistsRouter = require('./routes/checklists');
const runsRouter = require('./routes/runs');
const { notifyRunComplete } = require('./notifications');

const app = express();
const db = createDb(process.env.DB_PATH || './data.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/checklists', checklistsRouter(db));
app.use('/api/runs', runsRouter(db, notifyRunComplete));

app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Checklister running on http://localhost:${PORT}`));
```

- [ ] **Step 3: Create seed.js**
```js
// seed.js
require('dotenv').config();
const { createDb } = require('./db');
const { v4: uuidv4 } = require('uuid');

const db = createDb(process.env.DB_PATH || './data.db');

if (db.prepare("SELECT id FROM checklists WHERE name='Battle Stations'").get()) {
  console.log('Already seeded.'); db.close(); process.exit(0);
}

const steps = [
  { id: uuidv4(), text: 'Any open positions that conflict with this event?', allow_note: true, skippable: false },
  { id: uuidv4(), text: 'Caffeine or stimulant — take it now if you need it', allow_note: false, skippable: true },
  { id: uuidv4(), text: "Food situation — eat now or don't. Nothing ordered within 30 min of event.", allow_note: false, skippable: false },
  { id: uuidv4(), text: 'Surf open with profiles loaded?', allow_note: false, skippable: false },
  { id: uuidv4(), text: 'All exchanges logged in?', allow_note: true, skippable: false },
  { id: uuidv4(), text: 'Low-latency feed ready? (NOT YouTube)', allow_note: false, skippable: false },
  { id: uuidv4(), text: 'Screen recording started?', allow_note: false, skippable: false }
];

db.prepare(`INSERT INTO checklists (id,name,description,steps,slack_webhook_url,notification_email) VALUES (?,?,?,?,?,?)`)
  .run(uuidv4(), 'Battle Stations', 'Pre-event readiness protocol',
    JSON.stringify(steps),
    process.env.BATTLE_STATIONS_SLACK_WEBHOOK || '',
    process.env.BATTLE_STATIONS_EMAIL || '');

console.log('Battle Stations seeded.'); db.close();
```

- [ ] **Step 4: Smoke test**

Terminal 1:
```bash
cp .env.example .env
node server.js
```
Terminal 2:
```bash
curl http://localhost:3000/api/checklists
# Expected: []
node seed.js
curl http://localhost:3000/api/checklists
# Expected: JSON array with Battle Stations
```
Stop server with Ctrl+C.

- [ ] **Step 5: Commit**
```bash
git add server.js seed.js public/.gitkeep
git commit -m "feat: server entry point and Battle Stations seed"
```


---

### Task 7: Runner Frontend

**Files:** `public/style.css`, `public/index.html`, `public/runner.js`

- [ ] **Step 1: Create public/style.css**

```css
/* public/style.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f0f13; --surface: #13131a; --border: #252530;
  --text: #e8e8f0; --muted: #555; --accent: #5b8af5;
  --yes: #00c853; --yes-text: #002210; --r: 14px;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
body { background: var(--bg); color: var(--text); font-family: var(--font); min-height: 100dvh; display: flex; justify-content: center; }
.app { width: 100%; max-width: 480px; display: flex; flex-direction: column; min-height: 100dvh; }
.progress-bar { height: 3px; background: var(--border); }
.progress-fill { height: 100%; background: var(--accent); transition: width 0.3s; }
.header { padding: 16px 20px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
.header-title { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; }
.header-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
.header-link { font-size: 12px; color: var(--accent); background: none; border: none; cursor: pointer; font-family: var(--font); padding: 0; }
.content { padding: 32px 24px 24px; flex: 1; display: flex; flex-direction: column; gap: 20px; }
.card-list { display: flex; flex-direction: column; gap: 10px; }
.card { background: var(--surface); border: 1.5px solid var(--border); border-radius: var(--r); padding: 18px 20px; cursor: pointer; transition: border-color 0.15s, background 0.15s; display: flex; align-items: center; justify-content: space-between; gap: 12px; -webkit-tap-highlight-color: transparent; }
.card:hover { border-color: var(--accent); background: #16162a; }
.card:active { transform: scale(0.98); }
.card-name { font-size: 16px; font-weight: 700; }
.card-meta { font-size: 12px; color: var(--muted); margin-top: 3px; }
.card-arrow { font-size: 20px; color: var(--border); }
.step-q { font-size: 26px; font-weight: 800; line-height: 1.2; letter-spacing: -0.5px; }
.actions { display: flex; flex-direction: column; gap: 10px; margin-top: auto; }
.btn { width: 100%; padding: 17px 24px; border: none; border-radius: var(--r); font-size: 16px; font-weight: 700; cursor: pointer; font-family: var(--font); transition: all 0.15s; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }
.btn:active { transform: scale(0.97); }
.btn-primary { background: var(--accent); color: #fff; }
.btn-yes { background: var(--yes); color: var(--yes-text); }
.btn-no { background: var(--surface); color: var(--text); border: 1.5px solid var(--border); }
.btn-ghost { background: transparent; color: var(--muted); font-size: 14px; padding: 10px; }
.field input, .field textarea { background: var(--surface); border: 1.5px solid var(--border); border-radius: 12px; color: var(--text); font-size: 17px; padding: 14px 16px; width: 100%; outline: none; font-family: var(--font); }
.field input:focus, .field textarea:focus { border-color: var(--accent); }
.field textarea { resize: none; height: 80px; font-size: 14px; }
.field-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.summary-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r); }
.response-item { padding: 10px 14px; display: flex; gap: 10px; align-items: flex-start; border-bottom: 1px solid var(--border); font-size: 13px; }
.response-item:last-child { border-bottom: none; }
.resp-icon { flex-shrink: 0; font-size: 15px; margin-top: 1px; }
.resp-body { color: #aaa; line-height: 1.4; }
.resp-note { font-size: 12px; color: var(--muted); margin-top: 3px; }
.notif { font-size: 13px; color: #4caf50; }
.hidden { display: none !important; }
```

- [ ] **Step 2: Create public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Checklister</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="app">
  <div id="screen-home" class="hidden">
    <div class="header">
      <div><div class="header-title">Checklister</div><div class="header-sub">Pick a checklist to run</div></div>
      <button class="header-link" onclick="location.href='/admin'">Admin</button>
    </div>
    <div class="content"><div class="card-list" id="checklist-cards"></div></div>
  </div>

  <div id="screen-name" class="hidden">
    <div class="header">
      <div><div class="header-title" id="name-title"></div><div class="header-sub" id="name-sub"></div></div>
      <button class="header-link" onclick="goHome()">X</button>
    </div>
    <div class="content">
      <div><div class="step-q">Who's running this?</div><div class="header-sub" style="margin-top:8px;">Optional</div></div>
      <div class="field"><input type="text" id="runner-name-input" placeholder="Your name..." autocomplete="name"></div>
      <div class="actions">
        <button class="btn btn-primary" onclick="startRun()">Start</button>
        <button class="btn btn-ghost" onclick="startRun()">Skip</button>
      </div>
    </div>
  </div>

  <div id="screen-step" class="hidden">
    <div class="progress-bar"><div class="progress-fill" id="step-progress"></div></div>
    <div class="header">
      <div class="header-sub" id="step-label"></div>
      <button class="header-link" onclick="goHome()">X</button>
    </div>
    <div class="content">
      <div class="step-q" id="step-question"></div>
      <div class="field hidden" id="note-field">
        <div class="field-label">Note (optional)</div>
        <textarea id="note-input" placeholder="Add a note..."></textarea>
      </div>
      <div class="actions" id="step-actions"></div>
    </div>
  </div>

  <div id="screen-complete" class="hidden">
    <div class="header"><div class="header-title" id="complete-title"></div></div>
    <div class="content" style="gap:14px;align-items:center;text-align:center;">
      <div style="font-size:56px;">OK</div>
      <div style="font-size:22px;font-weight:800;">Checklist Complete</div>
      <div class="header-sub" id="complete-sub"></div>
      <div class="summary-box" style="width:100%;text-align:left;"><div id="response-list"></div></div>
      <div id="notif-status"></div>
      <button class="btn btn-ghost" onclick="goHome()">Back to checklists</button>
    </div>
  </div>
</div>
<script src="/runner.js"></script>
</body>
</html>
```

Note: The completion icon `OK` above is a placeholder — replace with `✅` emoji in the actual file if your editor/terminal supports it. Same applies to arrow and X characters throughout.

- [ ] **Step 3: Create public/runner.js**

```js
// public/runner.js
const state = {
  checklists: [], checklist: null, runId: null,
  runnerName: '', stepIndex: 0, responses: []
};
const SCREENS = ['screen-home','screen-name','screen-step','screen-complete'];

function show(id) {
  SCREENS.forEach(s => document.getElementById(s).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function goHome() {
  const res = await fetch('/api/checklists');
  state.checklists = await res.json();
  const el = document.getElementById('checklist-cards');
  if (!state.checklists.length) {
    el.innerHTML = '<p style="color:var(--muted);padding:20px 0;">No checklists yet. <a href="/admin" style="color:var(--accent);">Create one in admin</a></p>';
  } else {
    el.innerHTML = state.checklists.map(cl =>
      `<div class="card" onclick="selectChecklist('${cl.id}')">
        <div>
          <div class="card-name">${esc(cl.name)}</div>
          <div class="card-meta">${cl.step_count} step${cl.step_count !== 1 ? 's' : ''}</div>
        </div>
        <div class="card-arrow">›</div>
      </div>`
    ).join('');
  }
  show('screen-home');
}

async function selectChecklist(id) {
  state.checklist = await fetch('/api/checklists/' + id).then(r => r.json());
  document.getElementById('name-title').textContent = state.checklist.name;
  document.getElementById('name-sub').textContent = state.checklist.steps.length + ' steps';
  document.getElementById('runner-name-input').value = '';
  show('screen-name');
}

async function startRun() {
  state.runnerName = document.getElementById('runner-name-input').value.trim();
  state.stepIndex = 0;
  state.responses = [];
  const run = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checklist_id: state.checklist.id, runner_name: state.runnerName })
  }).then(r => r.json());
  state.runId = run.id;
  showStep();
}

function showStep() {
  const steps = state.checklist.steps;
  if (state.stepIndex >= steps.length) { completeRun(); return; }
  const step = steps[state.stepIndex];
  const pct = Math.round(state.stepIndex / steps.length * 100);
  document.getElementById('step-progress').style.width = pct + '%';
  document.getElementById('step-label').textContent =
    state.checklist.name + ' · Step ' + (state.stepIndex + 1) + ' of ' + steps.length;
  document.getElementById('step-question').textContent = step.text;
  const noteField = document.getElementById('note-field');
  if (step.allow_note) {
    noteField.classList.remove('hidden');
    document.getElementById('note-input').value = '';
  } else {
    noteField.classList.add('hidden');
  }
  const skipBtn = step.skippable
    ? '<button class="btn btn-ghost" onclick="answer(\'skip\')">Skip</button>'
    : '';
  document.getElementById('step-actions').innerHTML =
    '<button class="btn btn-no" onclick="answer(\'no\')">No</button>' +
    '<button class="btn btn-yes" onclick="answer(\'yes\')">Yes</button>' +
    skipBtn;
  show('screen-step');
}

async function answer(ans) {
  const step = state.checklist.steps[state.stepIndex];
  const note = step.allow_note ? document.getElementById('note-input').value.trim() : '';
  state.responses.push({ step_id: step.id, answer: ans, note: note, answered_at: new Date().toISOString() });
  await fetch('/api/runs/' + state.runId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses: state.responses })
  });
  state.stepIndex++;
  showStep();
}

async function completeRun() {
  await fetch('/api/runs/' + state.runId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses: state.responses, completed_at: new Date().toISOString() })
  });
  document.getElementById('complete-title').textContent = state.checklist.name;
  document.getElementById('complete-sub').textContent =
    (state.runnerName || 'Anonymous') + ' · ' + state.responses.length + ' steps';
  document.getElementById('response-list').innerHTML = state.responses.map(function(r) {
    const step = state.checklist.steps.find(function(s) { return s.id === r.step_id; });
    const icon = r.answer === 'yes' ? '+' : r.answer === 'no' ? '-' : '~';
    const noteHtml = r.note ? '<div class="resp-note">' + esc(r.note) + '</div>' : '';
    return '<div class="response-item"><div class="resp-icon">' + icon + '</div><div class="resp-body">' + esc(step ? step.text : r.step_id) + noteHtml + '</div></div>';
  }).join('');
  const notifs = [];
  if (state.checklist.slack_webhook_url) notifs.push('Slack notified');
  if (state.checklist.notification_email) notifs.push('Email sent');
  document.getElementById('notif-status').innerHTML = notifs.map(function(n) {
    return '<div class="notif">' + n + '</div>';
  }).join('');
  show('screen-complete');
}

goHome();
```

Note: The `+` / `-` / `~` icons above are ASCII placeholders for the actual checkmark/cross characters. Replace with proper Unicode in the final file.

- [ ] **Step 4: Smoke test**

```bash
node server.js
# separate terminal: node seed.js (if not already done)
```
Open http://localhost:3000 at 375px mobile viewport (DevTools mobile mode).

Verify in order:
1. Home shows Battle Stations card
2. Tap card → name screen
3. Enter name, tap Start → Step 1 appears (note textarea visible, since allow_note is true)
4. Answer all 7 steps → completion screen with response list
5. Tap "Back to checklists" → home screen

Stop server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add public/style.css public/index.html public/runner.js
git commit -m "feat: runner frontend"
```

---

### Task 8: Admin Frontend

**Files:** `public/admin.html`, `public/admin.js`

- [ ] **Step 1: Create public/admin.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Checklister Admin</title>
  <link rel="stylesheet" href="/style.css">
  <style>
    body { background: var(--bg); }
    .wrap { max-width: 820px; margin: 0 auto; padding: 24px 20px 60px; }
    .nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .nav-title { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
    .nav-link { font-size: 13px; color: var(--accent); background: none; border: none; cursor: pointer; font-family: var(--font); text-decoration: none; }
    .sec-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .sec-title { font-size: 16px; font-weight: 700; }
    .box { background: var(--surface); border: 1.5px solid var(--border); border-radius: 16px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); padding: 12px 16px; border-bottom: 1px solid var(--border); }
    td { padding: 13px 16px; border-bottom: 1px solid #1a1a22; font-size: 14px; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #16161e; }
    .td-name { font-weight: 600; color: var(--text); }
    .td-m { color: var(--muted); }
    .acts { display: flex; gap: 10px; }
    .act { font-size: 12px; color: var(--accent); background: none; border: none; cursor: pointer; font-family: var(--font); padding: 0; }
    .act:hover { text-decoration: underline; }
    .act.del { color: #ff5252; }
    .ed-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
    .ed-foot { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; gap: 10px; justify-content: flex-end; background: #0f0f13; }
    .fg { display: flex; flex-direction: column; gap: 6px; }
    .fg label { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
    .fg input, .fg textarea { background: #1a1a24; border: 1.5px solid var(--border); border-radius: 10px; color: var(--text); font-size: 15px; padding: 11px 14px; width: 100%; outline: none; font-family: var(--font); }
    .fg input:focus, .fg textarea:focus { border-color: var(--accent); }
    .fg textarea { font-family: 'SF Mono','Menlo',monospace; font-size: 13px; line-height: 1.8; resize: vertical; min-height: 160px; }
    .hint { font-size: 11px; color: #333; }
    .divider { height: 1px; background: var(--border); }
    .step-opts { display: flex; flex-direction: column; gap: 6px; }
    .sopt { background: #1a1a24; border: 1px solid #1e1e2a; border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .sopt-text { font-size: 13px; color: #ccc; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tg { display: flex; gap: 14px; flex-shrink: 0; }
    .tog { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); cursor: pointer; }
    .tog input { accent-color: var(--accent); }
    .ir { display: flex; gap: 8px; }
    .btn-sm { padding: 8px 14px; font-size: 13px; border-radius: 8px; width: auto; }
    .btn-outline { background: transparent; border: 1.5px solid var(--border); color: #888; }
    .btn-outline:hover { border-color: var(--accent); color: var(--accent); }
    .log-row { padding: 12px 16px; border-bottom: 1px solid #1a1a22; display: flex; gap: 10px; align-items: center; cursor: pointer; }
    .log-row:last-child { border-bottom: none; }
    .log-row:hover { background: #16161e; }
    .log-dot { width: 8px; height: 8px; border-radius: 50%; background: #00c853; flex-shrink: 0; }
    .log-dot.inc { background: var(--muted); }
    .log-info { flex: 1; }
    .log-name { font-size: 14px; font-weight: 600; }
    .log-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .log-score { font-size: 13px; color: var(--muted); }
    .log-detail { display: none; padding: 0 16px 14px 34px; background: #16161e; border-bottom: 1px solid #1a1a22; flex-direction: column; gap: 4px; }
    .log-detail.open { display: flex; }
    .log-detail-row { font-size: 12px; color: var(--muted); padding: 2px 0; line-height: 1.4; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="nav">
    <div class="nav-title">Checklister Admin</div>
    <a href="/" class="nav-link">Runner view</a>
  </div>

  <div id="view-list">
    <div class="sec-header">
      <div class="sec-title">Checklists</div>
      <button class="btn btn-primary btn-sm" onclick="showEditor(null)">+ New Checklist</button>
    </div>
    <div class="box">
      <table>
        <thead><tr><th>Name</th><th>Steps</th><th>Runs</th><th>Notifications</th><th></th></tr></thead>
        <tbody id="tbl"></tbody>
      </table>
    </div>
  </div>

  <div id="view-editor" class="hidden">
    <div class="sec-header">
      <div class="sec-title" id="ed-heading">New Checklist</div>
      <button class="nav-link" onclick="showList()">Back</button>
    </div>
    <div class="box">
      <div class="ed-body">
        <div class="fg"><label>Checklist Name</label><input type="text" id="ed-name" placeholder="e.g. Battle Stations"></div>
        <div class="fg"><label>Description (optional)</label><input type="text" id="ed-desc" placeholder="Shown on the home screen..."></div>
        <div class="divider"></div>
        <div class="fg">
          <label>Steps — one per line</label>
          <textarea id="ed-steps" placeholder="Type each step on its own line..." oninput="scheduleRegen()"></textarea>
          <div class="hint">Each line becomes one step. Reorder by moving lines up or down.</div>
        </div>
        <div id="opts-wrap" class="hidden">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Per-step options</div>
          <div class="step-opts" id="opts"></div>
        </div>
        <div class="divider"></div>
        <div class="fg"><label>Slack Webhook URL</label><input type="url" id="ed-slack" placeholder="https://hooks.slack.com/services/..."></div>
        <div class="fg"><label>Notification Email</label><input type="email" id="ed-email" placeholder="you@example.com"></div>
        <div class="divider"></div>
        <div>
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Import / Export</div>
          <div class="ir">
            <button class="btn btn-outline btn-sm" onclick="exportJson()">Export JSON</button>
            <button class="btn btn-outline btn-sm" onclick="importJson()">Import JSON</button>
          </div>
        </div>
      </div>
      <div class="ed-foot">
        <button class="btn btn-outline btn-sm" onclick="showList()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="saveChecklist()">Save Checklist</button>
      </div>
    </div>
  </div>

  <div id="view-log" class="hidden">
    <div class="sec-header">
      <div class="sec-title" id="log-heading">Run Log</div>
      <button class="nav-link" onclick="showList()">Back</button>
    </div>
    <div class="box" id="log-box"></div>
  </div>
</div>
<script src="/admin.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create public/admin.js**

```js
// public/admin.js
var editingId = null, stepMeta = [], regenTimer = null;

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function g(id) { return document.getElementById(id); }
function showV(id) {
  ['view-list','view-editor','view-log'].forEach(function(x) { g(x).classList.add('hidden'); });
  g(id).classList.remove('hidden');
}

async function showList() {
  showV('view-list');
  var lists = await fetch('/api/checklists').then(function(r) { return r.json(); });
  var tbody = g('tbl');
  if (!lists.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted);padding:20px;">No checklists yet.</td></tr>';
    return;
  }
  tbody.innerHTML = lists.map(function(cl) {
    var notifs = [cl.slack_webhook_url ? 'Slack' : '', cl.notification_email ? 'Email' : ''].filter(Boolean).join(', ') || 'None';
    return '<tr>' +
      '<td class="td-name">' + esc(cl.name) + '</td>' +
      '<td class="td-m">' + cl.step_count + '</td>' +
      '<td class="td-m">' + cl.run_count + '</td>' +
      '<td class="td-m">' + notifs + '</td>' +
      '<td><div class="acts">' +
        '<button class="act" onclick="editCl(\'' + cl.id + '\')">Edit</button>' +
        '<button class="act" onclick="viewLog(\'' + cl.id + '\')">Runs</button>' +
        '<button class="act del" onclick="deleteCl(\'' + cl.id + '\',\'' + esc(cl.name) + '\')">Delete</button>' +
      '</div></td>' +
      '</tr>';
  }).join('');
}

async function showEditor(cl) {
  editingId = cl ? cl.id : null;
  g('ed-heading').textContent = cl ? ('Edit: ' + cl.name) : 'New Checklist';
  g('ed-name').value = cl ? cl.name : '';
  g('ed-desc').value = cl ? cl.description : '';
  g('ed-slack').value = cl ? cl.slack_webhook_url : '';
  g('ed-email').value = cl ? cl.notification_email : '';
  if (cl && cl.steps.length) {
    g('ed-steps').value = cl.steps.map(function(s) { return s.text; }).join('\n');
    stepMeta = cl.steps.map(function(s) { return { allow_note: s.allow_note, skippable: s.skippable }; });
  } else {
    g('ed-steps').value = '';
    stepMeta = [];
  }
  regenOpts();
  showV('view-editor');
}

async function editCl(id) {
  var cl = await fetch('/api/checklists/' + id).then(function(r) { return r.json(); });
  showEditor(cl);
}

async function viewLog(id) {
  var cl = await fetch('/api/checklists/' + id).then(function(r) { return r.json(); });
  var runs = await fetch('/api/runs?checklist_id=' + id).then(function(r) { return r.json(); });
  g('log-heading').textContent = 'Run Log: ' + cl.name;
  var box = g('log-box');
  if (!runs.length) {
    box.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:14px;">No runs yet.</div>';
    showV('view-log');
    return;
  }
  box.innerHTML = runs.map(function(run, i) {
    var done = !!run.completed_at;
    var yes = run.responses.filter(function(r) { return r.answer === 'yes'; }).length;
    var detail = run.responses.map(function(r) {
      var step = cl.steps.find(function(s) { return s.id === r.step_id; });
      var icon = r.answer === 'yes' ? '+' : r.answer === 'no' ? '-' : '~';
      var noteHtml = r.note ? ' <span style="color:#888;">(' + esc(r.note) + ')</span>' : '';
      return '<div class="log-detail-row">' + icon + ' ' + esc(step ? step.text : r.step_id) + noteHtml + '</div>';
    }).join('');
    return '<div class="log-row" onclick="g(\'ld' + i + '\').classList.toggle(\'open\')">' +
      '<div class="log-dot ' + (done ? '' : 'inc') + '"></div>' +
      '<div class="log-info"><div class="log-name">' + esc(run.runner_name || 'Anonymous') + '</div>' +
      '<div class="log-meta">' + new Date(run.started_at).toLocaleString() + '</div></div>' +
      '<div class="log-score">' + (done ? yes + '/' + cl.steps.length : 'Abandoned') + '</div>' +
      '</div>' +
      '<div class="log-detail" id="ld' + i + '">' + detail + '</div>';
  }).join('');
  showV('view-log');
}

async function deleteCl(id, name) {
  if (!confirm('Delete "' + name + '"? All run history will be lost.')) return;
  await fetch('/api/checklists/' + id, { method: 'DELETE' });
  showList();
}

function scheduleRegen() { clearTimeout(regenTimer); regenTimer = setTimeout(regenOpts, 400); }

function regenOpts() {
  var lines = g('ed-steps').value.split('\n').filter(function(l) { return l.trim(); });
  while (stepMeta.length < lines.length) stepMeta.push({ allow_note: false, skippable: false });
  stepMeta = stepMeta.slice(0, lines.length);
  var wrap = g('opts-wrap'), opts = g('opts');
  if (!lines.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  opts.innerHTML = lines.map(function(line, i) {
    return '<div class="sopt">' +
      '<div class="sopt-text">' + esc(line) + '</div>' +
      '<div class="tg">' +
        '<label class="tog"><input type="checkbox" ' + (stepMeta[i].allow_note ? 'checked' : '') + ' onchange="stepMeta[' + i + '].allow_note=this.checked"> Allow note</label>' +
        '<label class="tog"><input type="checkbox" ' + (stepMeta[i].skippable ? 'checked' : '') + ' onchange="stepMeta[' + i + '].skippable=this.checked"> Skippable</label>' +
      '</div></div>';
  }).join('');
}

async function saveChecklist() {
  var name = g('ed-name').value.trim();
  if (!name) { alert('Name is required.'); return; }
  var lines = g('ed-steps').value.split('\n').filter(function(l) { return l.trim(); });
  var existingSteps = [];
  if (editingId) {
    existingSteps = (await fetch('/api/checklists/' + editingId).then(function(r) { return r.json(); })).steps;
  }
  var steps = lines.map(function(text, i) {
    return {
      id: existingSteps[i] ? existingSteps[i].id : generateId(),
      text: text,
      allow_note: stepMeta[i] ? !!stepMeta[i].allow_note : false,
      skippable: stepMeta[i] ? !!stepMeta[i].skippable : false
    };
  });
  var body = {
    name: name,
    description: g('ed-desc').value.trim(),
    steps: steps,
    slack_webhook_url: g('ed-slack').value.trim(),
    notification_email: g('ed-email').value.trim()
  };
  var method = editingId ? 'PUT' : 'POST';
  var url = editingId ? '/api/checklists/' + editingId : '/api/checklists';
  await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  showList();
}

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function exportJson() {
  var lines = g('ed-steps').value.split('\n').filter(function(l) { return l.trim(); });
  var steps = lines.map(function(text, i) {
    return { id: generateId(), text: text, allow_note: stepMeta[i] ? !!stepMeta[i].allow_note : false, skippable: stepMeta[i] ? !!stepMeta[i].skippable : false };
  });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(steps, null, 2)], { type: 'application/json' }));
  a.download = 'checklist-steps.json';
  a.click();
}

function importJson() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = function(e) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var steps = JSON.parse(ev.target.result);
        g('ed-steps').value = steps.map(function(s) { return s.text; }).join('\n');
        stepMeta = steps.map(function(s) { return { allow_note: !!s.allow_note, skippable: !!s.skippable }; });
        regenOpts();
      } catch(err) { alert('Invalid JSON file.'); }
    };
    reader.readAsText(e.target.files[0]);
  };
  input.click();
}

showList();
```

- [ ] **Step 3: Smoke test the admin**

With server running:

Open http://localhost:3000/admin

Verify:
1. Battle Stations row appears in table with step count, run count, notification columns
2. Click Edit → editor loads with all 7 steps in textarea, blur → per-step rows appear
3. Toggle a checkbox on a step, click Save → returns to list
4. Click Runs → run log (empty if no runs yet)
5. Run a checklist at http://localhost:3000, return to admin, click Runs → run appears, click row → expands with per-step responses
6. Click "+ New Checklist" → blank editor, type steps, blur → opts appear

- [ ] **Step 4: Commit**

```bash
git add public/admin.html public/admin.js
git commit -m "feat: admin frontend"
```

---

### Task 9: Railway Deployment

**Files:** `Procfile`, `railway.json`

- [ ] **Step 1: Create Procfile**

```
web: node server.js
```

- [ ] **Step 2: Create railway.json**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node server.js",
    "healthcheckPath": "/api/checklists",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage
```
Expected: PASS — 17 tests across 4 suites

- [ ] **Step 4: Commit**

```bash
git add Procfile railway.json
git commit -m "chore: Railway deployment config"
```

- [ ] **Step 5: Deploy**

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

- [ ] **Step 6: Seed production DB and verify**

```bash
railway run node seed.js
```

Open the Railway URL on mobile. Verify Battle Stations runs end to end. Bookmark:
- iOS Safari: Share → Add to Home Screen
- Android Chrome: menu → Add to Home Screen

