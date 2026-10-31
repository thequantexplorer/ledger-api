const { request, users } = require('./helpers');

const test = require('node:test');
const assert = require('node:assert');

const patch = (id, token, body) => request('PATCH', `/api/invoices/${id}`, { token, body });

test('invoice routes require authentication', async () => {
  assert.strictEqual((await request('GET', '/api/invoices/1')).status, 401);
  assert.strictEqual((await request('PATCH', '/api/invoices/1', { body: { status: 'paid' } })).status, 401);
});

test('a member can read an invoice in their workspace', async () => {
  const r = await request('GET', '/api/invoices/1', { token: await users.omar() });
  assert.strictEqual(r.status, 200);
  const { invoice } = await r.json();
  assert.strictEqual(invoice.number, 'NW-1001');
  assert.strictEqual(invoice.customer, 'Acme Corp');
  assert.strictEqual(invoice.customer_email, 'ap@acme.test');
  assert.strictEqual(invoice.amount_cents, 420000);
  assert.strictEqual(invoice.status, 'paid');
  assert.strictEqual(invoice.workspace_id, 1);
});

test('reading a missing invoice is a 404', async () => {
  const r = await request('GET', '/api/invoices/9999', { token: await users.maya() });
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(await r.json(), { error: 'invoice not found' });
});

test('updating a missing invoice is a 404', async () => {
  const r = await patch(9999, await users.maya(), { status: 'paid' });
  assert.strictEqual(r.status, 404);
});

test('non-members cannot update an invoice', async () => {
  const r = await patch(1, await users.lena(), { status: 'void' });
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(await r.json(), { error: 'invoice not found' });
  const { invoice } = await (await request('GET', '/api/invoices/1', { token: await users.maya() })).json();
  assert.strictEqual(invoice.status, 'paid');
});

test('an unknown status is rejected', async () => {
  const r = await patch(3, await users.maya(), { status: 'refunded' });
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(await r.json(), { error: 'invalid status' });
});

test('members can move an invoice to a non-void status', async () => {
  const token = await users.omar();
  const r = await patch(3, token, { status: 'sent' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { id: 3, status: 'sent' });
  const { invoice } = await (await request('GET', '/api/invoices/3', { token })).json();
  assert.strictEqual(invoice.status, 'sent');
});

test('a patch without a status keeps the current one', async () => {
  const r = await patch(3, await users.maya(), {});
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { id: 3, status: 'sent' });
});

test('owners can void invoices', async () => {
  const token = await users.maya();
  const r = await patch(2, token, { status: 'void' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { id: 2, status: 'void' });
  const { invoice } = await (await request('GET', '/api/invoices/2', { token })).json();
  assert.strictEqual(invoice.status, 'void');
});

test('admins can void invoices', async () => {
  const maya = await users.maya();
  await request('POST', '/api/workspaces/1/members', { token: maya, body: { email: 'lena@brightside.test', role: 'admin' } });
  const r = await patch(3, await users.lena(), { status: 'void' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { id: 3, status: 'void' });
});
