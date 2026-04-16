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
