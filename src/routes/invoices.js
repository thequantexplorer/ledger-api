const express = require('express');
const { db } = require('../lib/db');
const { requireUser, membership } = require('../lib/auth');

const router = express.Router();
router.use(requireUser);

const STATUSES = ['draft', 'sent', 'paid', 'void'];

router.get('/:id', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'invoice not found' });
  res.json({ invoice });
});

router.patch('/:id', (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'invoice not found' });
  const m = membership(req.user.id, invoice.workspace_id);
  if (!m) return res.status(404).json({ error: 'invoice not found' });
  const status = req.body?.status ?? invoice.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'invalid status' });
  if (status === 'void' && m.role === 'member') return res.status(403).json({ error: 'only admins can void invoices' });
  db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, invoice.id);
  res.json({ id: invoice.id, status });
});

module.exports = router;
