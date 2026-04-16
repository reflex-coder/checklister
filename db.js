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
