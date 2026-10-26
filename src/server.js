const express = require('express');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/workspaces/:workspaceId/reports', require('./routes/reports'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/invoices', require('./routes/invoices'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 4100);
  app.listen(port, () => console.log(`ledger api on :${port}`));
}

module.exports = app;
