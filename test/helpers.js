process.env.LEDGER_DB = ':memory:';
process.env.LEDGER_JWT_SECRET = 'test-secret';

const test = require('node:test');
const app = require('../src/server');

let server;
const base = () => `http://127.0.0.1:${server.address().port}`;

test.before(() => {
  require('../scripts/seed');
  server = app.listen(0);
});
test.after(() => server.close());

function request(method, path, { token, body, headers = {} } = {}) {
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    if (typeof body !== 'string') body = JSON.stringify(body);
  }
  return fetch(base() + path, { method, headers, body });
}

async function login(email, password) {
  const r = await request('POST', '/api/auth/login', { body: { email, password } });
  return (await r.json()).token;
}

const users = {
  maya: () => login('maya@northwind.test', 'maya-demo-pw'), // owner of workspace 1
  omar: () => login('omar@northwind.test', 'omar-demo-pw'), // member of workspace 1
  lena: () => login('lena@brightside.test', 'lena-demo-pw'), // owner of workspace 2
};

module.exports = { request, login, users, base };
