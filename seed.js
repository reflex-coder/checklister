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
