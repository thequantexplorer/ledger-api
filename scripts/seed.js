const { db } = require('../src/lib/db');
const { hashPassword } = require('../src/lib/auth');

db.exec('DELETE FROM invoices; DELETE FROM memberships; DELETE FROM workspaces; DELETE FROM users;');

const users = [
  [1, 'maya@northwind.test', 'Maya Chen', 'maya-demo-pw'],
  [2, 'omar@northwind.test', 'Omar Haddad', 'omar-demo-pw'],
  [3, 'lena@brightside.test', 'Lena Fischer', 'lena-demo-pw'],
];
for (const [id, email, name, pw] of users) {
  db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(id, email, name, hashPassword(pw));
}
db.prepare("INSERT INTO workspaces (id, name) VALUES (1, 'Northwind Studio'), (2, 'Brightside Dental')").run();
db.prepare("INSERT INTO memberships (user_id, workspace_id, role) VALUES (1, 1, 'owner'), (2, 1, 'member'), (3, 2, 'owner')").run();

const invoices = [
  [1, 'NW-1001', 'Acme Corp', 'ap@acme.test', 420000, 'paid'],
  [1, 'NW-1002', 'Globex', 'billing@globex.test', 185000, 'sent'],
  [1, 'NW-1003', 'Initech', 'finance@initech.test', 96000, 'draft'],
  [2, 'BD-2001', 'R. Alvarez', 'r.alvarez@mail.test', 32000, 'paid'],
  [2, 'BD-2002', 'J. Okafor', 'j.okafor@mail.test', 54000, 'sent'],
];
for (const [ws, number, customer, email, amount, status] of invoices) {
  db.prepare('INSERT INTO invoices (workspace_id, number, customer, customer_email, amount_cents, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(ws, number, customer, email, amount, status);
}

if (require.main === module) console.log('seeded 3 users, 2 workspaces, 5 invoices');
