const { request, users } = require('./helpers');

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { hashPassword, checkPassword } = require('../src/lib/auth');

test('hashPassword salts each hash and checkPassword verifies it', () => {
  const a = hashPassword('s3cret');
  const b = hashPassword('s3cret');
  assert.match(a, /^[0-9a-f]{32}:[0-9a-f]{64}$/);
  assert.notStrictEqual(a, b);
  assert.strictEqual(checkPassword('s3cret', a), true);
  assert.strictEqual(checkPassword('wrong', a), false);
});

test('hashPassword is deterministic for a given salt', () => {
  assert.strictEqual(hashPassword('pw', 'abc'), hashPassword('pw', 'abc'));
});

test('login requires email and password', async () => {
  for (const body of [{}, { email: 'maya@northwind.test' }, { password: 'maya-demo-pw' }]) {
    const r = await request('POST', '/api/auth/login', { body });
    assert.strictEqual(r.status, 400);
    assert.deepStrictEqual(await r.json(), { error: 'email and password are required' });
  }
});

test('login without a JSON body is a 400', async () => {
  const r = await request('POST', '/api/auth/login');
  assert.strictEqual(r.status, 400);
});

test('login rejects an unknown email', async () => {
  const r = await request('POST', '/api/auth/login', { body: { email: 'nobody@x.test', password: 'pw' } });
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(await r.json(), { error: 'invalid credentials' });
});

test('login issues an 8h token for the user', async () => {
  const token = await users.maya();
  const { sub, iat, exp } = jwt.verify(token, 'test-secret');
  assert.strictEqual(sub, 1);
  assert.strictEqual(exp - iat, 8 * 60 * 60);
});

test('protected routes require a bearer token', async () => {
  const r = await request('GET', '/api/workspaces');
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(await r.json(), { error: 'missing token' });
});

test('a non-Bearer authorization header is treated as missing', async () => {
  const token = await users.maya();
  const r = await request('GET', '/api/workspaces', { headers: { authorization: `Token ${token}` } });
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(await r.json(), { error: 'missing token' });
});

test('a malformed token is rejected', async () => {
  const r = await request('GET', '/api/workspaces', { token: 'not-a-jwt' });
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(await r.json(), { error: 'invalid token' });
});

test('a token signed with another secret is rejected', async () => {
  const r = await request('GET', '/api/workspaces', { token: jwt.sign({ sub: 1 }, 'other-secret') });
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(await r.json(), { error: 'invalid token' });
});

test('an expired token is rejected', async () => {
  const token = jwt.sign({ sub: 1, exp: Math.floor(Date.now() / 1000) - 60 }, 'test-secret');
  const r = await request('GET', '/api/workspaces', { token });
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(await r.json(), { error: 'invalid token' });
});

test('a valid token for a deleted user is rejected', async () => {
  const r = await request('GET', '/api/workspaces', { token: jwt.sign({ sub: 999 }, 'test-secret') });
  assert.strictEqual(r.status, 401);
  assert.deepStrictEqual(await r.json(), { error: 'unknown user' });
});

test('the auth module refuses to load without LEDGER_JWT_SECRET', () => {
  const env = { ...process.env, LEDGER_DB: ':memory:' };
  delete env.LEDGER_JWT_SECRET;
  const r = spawnSync(process.execPath, ['-e', "require('./src/lib/auth')"], {
    cwd: path.join(__dirname, '..'),
    env,
    encoding: 'utf8',
  });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /LEDGER_JWT_SECRET is not set/);
});
