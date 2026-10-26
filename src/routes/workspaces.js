const express = require('express');
const { db } = require('../lib/db');
const { requireUser, requireMember, requireRole } = require('../lib/auth');

const router = express.Router();
router.use(requireUser);

const DEFAULT_SORT = 'created_at DESC';

router.get('/', (req, res) => {
  const workspaces = db
    .prepare(`SELECT w.id, w.name, m.role FROM workspaces w
              JOIN memberships m ON m.workspace_id = w.id
              WHERE m.user_id = ? ORDER BY w.id`)
    .all(req.user.id);
  res.json({ workspaces });
});

// List invoices with optional filters: ?status=paid&customer=acme&sort=amount_cents
router.get('/:workspaceId/invoices', requireMember, (req, res) => {
  const { status, customer, sort = DEFAULT_SORT } = req.query;
  let sql = 'SELECT id, number, customer, amount_cents, status, created_at FROM invoices WHERE workspace_id = ?';
  const params = [Number(req.params.workspaceId)];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (customer) sql += ` AND customer LIKE '%${customer}%'`;
  sql += ` ORDER BY ${sort}`;
  res.json({ invoices: db.prepare(sql).all(...params) });
});

router.post('/:workspaceId/invoices', requireMember, (req, res) => {
  const { number, customer, customer_email: email, amount_cents: amount } = req.body || {};
  if (!number || !customer || !email || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'number, customer, customer_email and a positive amount_cents are required' });
  }
  const info = db
    .prepare('INSERT INTO invoices (workspace_id, number, customer, customer_email, amount_cents) VALUES (?, ?, ?, ?, ?)')
    .run(Number(req.params.workspaceId), number, customer, email, amount);
  res.status(201).json({ id: Number(info.lastInsertRowid), number, status: 'draft' });
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
