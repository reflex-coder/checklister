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
