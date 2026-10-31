const { request } = require('./helpers');

const test = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const childEnv = extra => ({ ...process.env, LEDGER_DB: ':memory:', LEDGER_JWT_SECRET: 'test-secret', ...extra });

test('GET /health', async () => {
  const r = await request('GET', '/health');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { ok: true });
});

test('unhandled errors return a generic 500 without details', async t => {
  const logged = t.mock.method(console, 'error', () => {});
  const r = await request('POST', '/api/auth/login', { body: '{"email":' });
  assert.strictEqual(r.status, 500);
  assert.deepStrictEqual(await r.json(), { error: 'internal error' });
  assert.strictEqual(logged.mock.callCount(), 1);
});

test('unknown routes are a 404', async () => {
  assert.strictEqual((await request('GET', '/api/nope')).status, 404);
});

async function freePort() {
  const srv = net.createServer().listen(0);
  await new Promise(r => srv.once('listening', r));
  const { port } = srv.address();
  await new Promise(r => srv.close(r));
  return port;
}

test('node src/server.js listens on PORT', async () => {
  const port = await freePort();
  // Exit cleanly on SIGTERM so the child's coverage gets written.
  const child = spawn(process.execPath, ['--require', './test/support/exit-on-sigterm.js', 'src/server.js'], {
    cwd: root,
    env: childEnv({ PORT: String(port) }),
  });
  const exited = new Promise(r => child.once('exit', r));
  try {
    const line = await new Promise((resolve, reject) => {
      child.stdout.once('data', d => resolve(String(d).trim()));
      child.once('exit', code => reject(new Error(`server exited with ${code}`)));
    });
    assert.strictEqual(line, `ledger api on :${port}`);
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    assert.deepStrictEqual(await r.json(), { ok: true });
  } finally {
    child.kill();
    await exited;
  }
});

test('npm run seed creates the database file and its directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  try {
    const dbPath = path.join(dir, 'nested', 'ledger.db');
    const r = spawnSync(process.execPath, ['scripts/seed.js'], { cwd: root, env: childEnv({ LEDGER_DB: dbPath }), encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(r.stdout.trim(), 'seeded 3 users, 2 workspaces, 5 invoices');
    assert.ok(fs.statSync(dbPath).size > 0);

    const again = spawnSync(process.execPath, ['scripts/seed.js'], { cwd: root, env: childEnv({ LEDGER_DB: dbPath }), encoding: 'utf8' });
    assert.strictEqual(again.status, 0, again.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
