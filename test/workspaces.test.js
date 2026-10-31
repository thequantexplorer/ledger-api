const { request, users } = require('./helpers');

const test = require('node:test');
const assert = require('node:assert');

const numbers = async r => (await r.json()).invoices.map(i => i.number);

test('the workspace list includes the caller role', async () => {
  const { workspaces } = await (await request('GET', '/api/workspaces', { token: await users.omar() })).json();
  assert.deepStrictEqual(workspaces, [{ id: 1, name: 'Northwind Studio', role: 'member' }]);
});

test('listing invoices returns only that workspace', async () => {
  const r = await request('GET', '/api/workspaces/1/invoices', { token: await users.maya() });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual((await numbers(r)).sort(), ['NW-1001', 'NW-1002', 'NW-1003']);
});

test('listed invoices omit customer_email', async () => {
  const { invoices } = await (await request('GET', '/api/workspaces/1/invoices', { token: await users.maya() })).json();
  for (const i of invoices) {
    assert.deepStrictEqual(Object.keys(i).sort(), ['amount_cents', 'created_at', 'customer', 'id', 'number', 'status']);
  }
});

test('invoices can be filtered by customer name, case-insensitively', async () => {
  const r = await request('GET', '/api/workspaces/1/invoices?customer=acme', { token: await users.maya() });
  assert.deepStrictEqual(await numbers(r), ['NW-1001']);
});

test('status and customer filters combine', async () => {
  const token = await users.maya();
  assert.deepStrictEqual(await numbers(await request('GET', '/api/workspaces/1/invoices?status=sent&customer=glob', { token })), ['NW-1002']);
  assert.deepStrictEqual(await numbers(await request('GET', '/api/workspaces/1/invoices?status=paid&customer=glob', { token })), []);
});

test('invoices can be sorted by amount', async () => {
  const r = await request('GET', '/api/workspaces/1/invoices?sort=amount_cents', { token: await users.maya() });
  assert.deepStrictEqual(await numbers(r), ['NW-1003', 'NW-1002', 'NW-1001']);
});

test('members can create a draft invoice', async () => {
  const token = await users.omar();
  const body = { number: 'NW-1004', customer: 'Umbrella', customer_email: 'ap@umbrella.test', amount_cents: 12345 };
  const r = await request('POST', '/api/workspaces/1/invoices', { token, body });
  assert.strictEqual(r.status, 201);
  const created = await r.json();
  assert.deepStrictEqual(created, { id: created.id, number: 'NW-1004', status: 'draft' });
  assert.ok(Number.isInteger(created.id));

  const { invoice } = await (await request('GET', `/api/invoices/${created.id}`, { token })).json();
  assert.strictEqual(invoice.workspace_id, 1);
  assert.strictEqual(invoice.customer_email, 'ap@umbrella.test');
  assert.strictEqual(invoice.amount_cents, 12345);
  assert.strictEqual(invoice.status, 'draft');
});

test('creating an invoice validates the payload', async () => {
  const token = await users.maya();
  const valid = { number: 'NW-9', customer: 'X', customer_email: 'x@x.test', amount_cents: 100 };
  const cases = [
    { ...valid, number: undefined },
    { ...valid, customer: '' },
    { ...valid, customer_email: undefined },
    { ...valid, amount_cents: undefined },
    { ...valid, amount_cents: '100' },
    { ...valid, amount_cents: 10.5 },
    { ...valid, amount_cents: 0 },
    { ...valid, amount_cents: -100 },
  ];
  for (const body of cases) {
    const r = await request('POST', '/api/workspaces/1/invoices', { token, body });
    assert.strictEqual(r.status, 400, JSON.stringify(body));
  }
  const r = await request('POST', '/api/workspaces/1/invoices', { token });
  assert.strictEqual(r.status, 400);
});

test('non-members cannot create invoices in another workspace', async () => {
  const body = { number: 'X-1', customer: 'X', customer_email: 'x@x.test', amount_cents: 100 };
  const r = await request('POST', '/api/workspaces/1/invoices', { token: await users.lena(), body });
  assert.strictEqual(r.status, 404);
});

test('adding a member rejects roles other than member/admin', async () => {
  const r = await request('POST', '/api/workspaces/1/members', {
    token: await users.maya(),
    body: { email: 'lena@brightside.test', role: 'owner' },
  });
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(await r.json(), { error: 'invalid role' });
});

test('adding an unknown user is a 404', async () => {
  const r = await request('POST', '/api/workspaces/1/members', {
    token: await users.maya(),
    body: { email: 'ghost@x.test' },
  });
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(await r.json(), { error: 'user not found' });
});

test('non-members cannot add members to another workspace', async () => {
  const r = await request('POST', '/api/workspaces/1/members', {
    token: await users.lena(),
    body: { email: 'lena@brightside.test', role: 'admin' },
  });
  assert.strictEqual(r.status, 404);
});

test('owners can add members, who default to the member role', async () => {
  const r = await request('POST', '/api/workspaces/1/members', {
    token: await users.maya(),
    body: { email: 'lena@brightside.test' },
  });
  assert.strictEqual(r.status, 201);
  assert.deepStrictEqual(await r.json(), { email: 'lena@brightside.test', role: 'member' });

  const { workspaces } = await (await request('GET', '/api/workspaces', { token: await users.lena() })).json();
  assert.deepStrictEqual(workspaces, [
    { id: 1, name: 'Northwind Studio', role: 'member' },
    { id: 2, name: 'Brightside Dental', role: 'owner' },
  ]);
});

test('re-adding a member updates their role, and admins can add members', async () => {
  const maya = await users.maya();
  const promote = await request('POST', '/api/workspaces/1/members', {
    token: maya,
    body: { email: 'lena@brightside.test', role: 'admin' },
  });
  assert.strictEqual(promote.status, 201);

  const lena = await users.lena();
  const { workspaces } = await (await request('GET', '/api/workspaces', { token: lena })).json();
  assert.strictEqual(workspaces.find(w => w.id === 1).role, 'admin');

  const r = await request('POST', '/api/workspaces/1/members', {
    token: lena,
    body: { email: 'omar@northwind.test', role: 'member' },
  });
  assert.strictEqual(r.status, 201);
});
