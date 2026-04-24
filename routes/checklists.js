// routes/checklists.js
const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');

function validateChecklist(body) {
  const { name, description = '', steps = [], slack_webhook_url = '', notification_email = '' } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required';
  if (name.length > 200) return 'name must be 200 characters or fewer';
  if (typeof description !== 'string') return 'description must be a string';
  if (description.length > 1000) return 'description must be 1000 characters or fewer';
  if (!Array.isArray(steps)) return 'steps must be an array';
  if (steps.length > 100) return 'steps must have 100 items or fewer';
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.text || typeof s.text !== 'string' || !s.text.trim()) return `step ${i + 1}: text is required`;
    if (s.text.length > 500) return `step ${i + 1}: text must be 500 characters or fewer`;
  }
  if (slack_webhook_url && !slack_webhook_url.startsWith('https://')) {
    return 'slack_webhook_url must start with https://';
  }
  if (notification_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notification_email)) {
    return 'notification_email must be a valid email address';
  }
  return null;
}

module.exports = function checklistsRouter(db, adminAuth = (req, res, next) => next()) {
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

  router.post('/', adminAuth, (req, res) => {
    const validationError = validateChecklist(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const { name, description = '', steps = [], slack_webhook_url = '', notification_email = '' } = req.body;
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

  router.put('/:id', adminAuth, (req, res) => {
    const validationError = validateChecklist(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const { name, description = '', steps = [], slack_webhook_url = '', notification_email = '' } = req.body;
    if (!db.prepare('SELECT id FROM checklists WHERE id=?').get(req.params.id))
      return res.status(404).json({ error: 'not found' });
    db.prepare(`UPDATE checklists SET name=?,description=?,steps=?,slack_webhook_url=?,notification_email=?,updated_at=datetime('now') WHERE id=?`)
      .run(name, description, JSON.stringify(steps), slack_webhook_url, notification_email, req.params.id);
    const row = db.prepare('SELECT * FROM checklists WHERE id=?').get(req.params.id);
    res.json({ ...row, steps: JSON.parse(row.steps) });
  });

  router.delete('/:id', adminAuth, (req, res) => {
    if (!db.prepare('SELECT id FROM checklists WHERE id=?').get(req.params.id))
      return res.status(404).json({ error: 'not found' });
    db.prepare('DELETE FROM checklists WHERE id=?').run(req.params.id);
    res.status(204).end();
  });

  return router;
};
