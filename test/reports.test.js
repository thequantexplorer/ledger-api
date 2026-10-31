const { request, users } = require('./helpers');

const test = require('node:test');
const assert = require('node:assert');

test('the summary totals invoices by status for one workspace', async () => {
  const r = await request('GET', '/api/workspaces/1/reports/summary', { token: await users.omar() });
  assert.strictEqual(r.status, 200);
  const { summary } = await r.json();
  assert.deepStrictEqual(
    summary.sort((a, b) => a.status.localeCompare(b.status)),
    [
      { status: 'draft', count: 1, total_cents: 96000 },
      { status: 'paid', count: 1, total_cents: 420000 },
      { status: 'sent', count: 1, total_cents: 185000 },
    ],
  );
});

test('the summary groups multiple invoices with the same status', async () => {
  const token = await users.maya();
  await request('POST', '/api/workspaces/1/invoices', {
    token,
    body: { number: 'NW-1005', customer: 'Hooli', customer_email: 'ap@hooli.test', amount_cents: 4000 },
  });
  const { summary } = await (await request('GET', '/api/workspaces/1/reports/summary', { token })).json();
  assert.deepStrictEqual(summary.find(s => s.status === 'draft'), { status: 'draft', count: 2, total_cents: 100000 });
});

test('the summary requires authentication and membership', async () => {
  assert.strictEqual((await request('GET', '/api/workspaces/1/reports/summary')).status, 401);
  const r = await request('GET', '/api/workspaces/1/reports/summary', { token: await users.lena() });
  assert.strictEqual(r.status, 404);
});

test('the summary is scoped to the requested workspace', async () => {
  const { summary } = await (await request('GET', '/api/workspaces/2/reports/summary', { token: await users.lena() })).json();
  assert.deepStrictEqual(
    summary.sort((a, b) => a.status.localeCompare(b.status)),
    [
      { status: 'paid', count: 1, total_cents: 32000 },
      { status: 'sent', count: 1, total_cents: 54000 },
    ],
  );
});

test('the CSV export lists the workspace invoices in id order', async () => {
  const r = await request('GET', '/api/workspaces/2/reports/export.csv', { token: await users.lena() });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/csv/);
  const lines = (await r.text()).split('\n');
  assert.strictEqual(lines[0], 'number,customer,customer_email,amount_cents,status,created_at');
  assert.strictEqual(lines.length, 3);
  assert.match(lines[1], /^"BD-2001","R\. Alvarez","r\.alvarez@mail\.test","32000","paid","\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}"$/);
  assert.match(lines[2], /^"BD-2002","J\. Okafor","j\.okafor@mail\.test","54000","sent","/);
});

test('the CSV export escapes embedded quotes', async () => {
  const token = await users.lena();
  await request('POST', '/api/workspaces/2/invoices', {
    token,
    body: { number: 'BD-2003', customer: 'Dr. "Sam" Lee, DDS', customer_email: 'sam@mail.test', amount_cents: 1500 },
  });
  const lines = (await (await request('GET', '/api/workspaces/2/reports/export.csv', { token })).text()).split('\n');
  assert.ok(lines.at(-1).startsWith('"BD-2003","Dr. ""Sam"" Lee, DDS","sam@mail.test","1500","draft",'));
});
