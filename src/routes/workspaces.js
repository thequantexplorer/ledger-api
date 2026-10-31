const express = require('express');
const { db } = require('../lib/db');
const { requireUser, requireMember, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(requireUser);

const DEFAULT_SORT = 'created_at DESC';

const isIsoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

router.get('/', (req, res) => {
  const workspaces = db
    .prepare(`SELECT w.id, w.name, m.role FROM workspaces w
              JOIN memberships m ON m.workspace_id = w.id
              WHERE m.user_id = ? ORDER BY w.id`)
    .all(req.user.id);
  res.json({ workspaces });
});

// List invoices with optional filters: ?status=paid&customer=acme&due_before=2026-11-01&sort=amount_cents
router.get('/:workspaceId/invoices', requireMember, (req, res) => {
  const { status, customer, due_before: dueBefore, sort = DEFAULT_SORT } = req.query;
  if (dueBefore !== undefined && !isIsoDate(dueBefore)) {
    return res.status(400).json({ error: 'due_before must be a YYYY-MM-DD date' });
  }
  let sql = 'SELECT id, number, customer, amount_cents, status, due_date, created_at FROM invoices WHERE workspace_id = ?';
  const params = [Number(req.params.workspaceId)];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (dueBefore) {
    sql += ' AND due_date < ?';
    params.push(dueBefore);
  }
  if (customer) sql += ` AND customer LIKE '%${customer}%'`;
  sql += ` ORDER BY ${sort}`;
  res.json({ invoices: db.prepare(sql).all(...params) });
});

router.post('/:workspaceId/invoices', requireMember, (req, res) => {
  const { number, customer, customer_email: email, amount_cents: amount, due_date: dueDate = null } = req.body || {};
  if (!number || !customer || !email || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'number, customer, customer_email and a positive amount_cents are required' });
  }
  if (dueDate !== null && !isIsoDate(dueDate)) return res.status(400).json({ error: 'due_date must be a YYYY-MM-DD date' });
  const info = db
    .prepare('INSERT INTO invoices (workspace_id, number, customer, customer_email, amount_cents, due_date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(Number(req.params.workspaceId), number, customer, email, amount, dueDate);
  res.status(201).json({ id: Number(info.lastInsertRowid), number, status: 'draft', due_date: dueDate });
});

// Members can be added by owners and admins.
router.post('/:workspaceId/members', requireMember, requireRole('owner', 'admin'), (req, res) => {
  const { email, role = 'member' } = req.body || {};
  if (!['member', 'admin'].includes(role)) return res.status(400).json({ error: 'invalid role' });
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'user not found' });
  db.prepare('INSERT OR REPLACE INTO memberships (user_id, workspace_id, role) VALUES (?, ?, ?)')
    .run(user.id, Number(req.params.workspaceId), role);
  res.status(201).json({ email, role });
});

module.exports = router;
