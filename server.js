// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { createDb } = require('./db');
const checklistsRouter = require('./routes/checklists');
const runsRouter = require('./routes/runs');
const { notifyRunComplete } = require('./notifications');
const adminAuth = require('./middleware/adminAuth');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const db = createDb(process.env.DB_PATH || './data.db');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) =>
  res.json({ status: 'ok', uptime: process.uptime() }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api', apiLimiter);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/checklists', checklistsRouter(db, adminAuth));
app.use('/api/runs', runsRouter(db, notifyRunComplete, adminAuth));

app.get('/admin/login', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));

app.post('/admin/login', (req, res) => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || req.body.password === password) {
    res.cookie('admin_session', password || 'open', { httpOnly: true, sameSite: 'strict' });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid password' });
});

app.get('/admin', (req, res) => {
  const password = process.env.ADMIN_PASSWORD;
  if (password && req.cookies.admin_session !== password) {
    return res.redirect('/admin/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use(errorHandler);

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const server = app.listen(PORT, () =>
    console.log(`Checklister running on http://localhost:${PORT}`));

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}

module.exports = { app };
