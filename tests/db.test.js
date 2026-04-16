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
