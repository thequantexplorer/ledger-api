const express = require('express');
const { db } = require('../lib/db');
const { requireUser, requireMember, requireRole } = require('../lib/auth');

const router = express.Router({ mergeParams: true });

router.get('/summary', requireUser, requireMember, (req, res) => {
  const rows = db
    .prepare('SELECT status, COUNT(*) AS count, SUM(amount_cents) AS total_cents FROM invoices WHERE workspace_id = ? GROUP BY status')
    .all(Number(req.params.workspaceId));
  const { count } = db
    .prepare("SELECT COUNT(*) AS count FROM invoices WHERE workspace_id = ? AND status = 'sent' AND created_at < datetime('now', '-30 days')")
    .get(Number(req.params.workspaceId));
  res.json({ summary: rows, overdue_count: count });
});

// CSV export for the finance team's bookkeeping import.
router.get('/export.csv', (req, res) => {
  const rows = db
    .prepare('SELECT number, customer, customer_email, amount_cents, status, created_at FROM invoices WHERE workspace_id = ? ORDER BY id')
    .all(Number(req.params.workspaceId));
  const header = 'number,customer,customer_email,amount_cents,status,created_at';
  const csv = [header, ...rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  res.type('text/csv').send(csv);
});

module.exports = router;
