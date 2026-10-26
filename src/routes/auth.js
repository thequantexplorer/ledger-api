const express = require('express');
const { db } = require('../lib/db');
const { checkPassword, issueToken } = require('../lib/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !checkPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  res.json({ token: issueToken(user) });
});

module.exports = router;
