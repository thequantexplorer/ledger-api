process.env.LEDGER_DB = ':memory:';
process.env.LEDGER_JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert');
const app = require('../src/server');
const { db } = require('../src/lib/db');

let server;
const base = () => `http://127.0.0.1:${server.address().port}`;

test.before(() => {
  require('../scripts/seed');
  server = app.listen(0);
});
test.after(() => server.close());

async function login(email, password) {
  const r = await fetch(base() + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await r.json()).token;
}

const get = (path, token) => fetch(base() + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });

test('login rejects a wrong password', async () => {
  const r = await fetch(base() + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'maya@northwind.test', password: 'nope' }),
  });
  assert.strictEqual(r.status, 401);
});

test('a user lists only their own workspaces', async () => {
  const token = await login('maya@northwind.test', 'maya-demo-pw');
  const { workspaces } = await (await get('/api/workspaces', token)).json();
  assert.deepStrictEqual(workspaces.map(w => w.name), ['Northwind Studio']);
});

test('invoices can be filtered by status', async () => {
  const token = await login('maya@northwind.test', 'maya-demo-pw');
  const { invoices } = await (await get('/api/workspaces/1/invoices?status=paid', token)).json();
  assert.deepStrictEqual(invoices.map(i => i.number), ['NW-1001']);
});

test('reports summary counts sent invoices older than 30 days as overdue', async () => {
  const insertInvoice = db.prepare(`
    INSERT INTO invoices (workspace_id, number, customer, customer_email, amount_cents, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);
  insertInvoice.run(2, 'BD-OLD-SENT', 'Old Sent', 'old-sent@brightside.test', 10000, 'sent', '-45 days');
  insertInvoice.run(2, 'BD-OLD-PAID', 'Old Paid', 'old-paid@brightside.test', 20000, 'paid', '-90 days');

  const token = await login('lena@brightside.test', 'lena-demo-pw');
  const { overdue_count } = await (await get('/api/workspaces/2/reports/summary', token)).json();
  assert.strictEqual(overdue_count, 1);
});

test('non-members cannot list another workspace', async () => {
  const token = await login('lena@brightside.test', 'lena-demo-pw');
  const r = await get('/api/workspaces/1/invoices', token);
  assert.strictEqual(r.status, 404);
});

test('members cannot add other members', async () => {
  const token = await login('omar@northwind.test', 'omar-demo-pw');
  const r = await fetch(base() + '/api/workspaces/1/members', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'lena@brightside.test', role: 'admin' }),
  });
  assert.strictEqual(r.status, 403);
});

test('members cannot void invoices', async () => {
  const token = await login('omar@northwind.test', 'omar-demo-pw');
  const r = await fetch(base() + '/api/invoices/2', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'void' }),
  });
  assert.strictEqual(r.status, 403);
});
