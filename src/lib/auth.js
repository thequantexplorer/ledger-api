const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const SECRET = process.env.LEDGER_JWT_SECRET;
if (!SECRET) throw new Error('LEDGER_JWT_SECRET is not set');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function issueToken(user) {
  return jwt.sign({ sub: user.id }, SECRET, { expiresIn: '8h' });
}

function requireUser(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const { sub } = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(sub);
    if (!user) return res.status(401).json({ error: 'unknown user' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

function membership(userId, workspaceId) {
  return db
    .prepare('SELECT role FROM memberships WHERE user_id = ? AND workspace_id = ?')
    .get(userId, workspaceId);
}

// Loads the caller's membership for :workspaceId and rejects non-members.
function requireMember(req, res, next) {
  const m = membership(req.user.id, Number(req.params.workspaceId));
  if (!m) return res.status(404).json({ error: 'workspace not found' });
  req.role = m.role;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.role)) return res.status(403).json({ error: 'insufficient role' });
    next();
  };
}

module.exports = { hashPassword, checkPassword, issueToken, requireUser, requireMember, requireRole, membership };
