// routes/runs.js
const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');

module.exports = function runsRouter(db, notify, adminAuth = (req, res, next) => next()) {
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

  router.put('/:id', async (req, res, next) => {
    try {
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
        if (cl) {
          Promise.resolve(notify({ ...cl, steps: JSON.parse(cl.steps) }, result))
            .catch(err => console.error('notify error:', err));
        }
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/', adminAuth, (req, res) => {
    if (!req.query.checklist_id) return res.status(400).json({ error: 'checklist_id required' });
    const rows = db.prepare('SELECT * FROM runs WHERE checklist_id=? ORDER BY started_at DESC').all(req.query.checklist_id);
    res.json(rows.map(r => ({ ...r, responses: JSON.parse(r.responses) })));
  });

  return router;
};
