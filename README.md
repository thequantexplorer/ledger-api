# Ledger API

Invoicing backend for small teams. Users belong to workspaces (as `owner`, `admin` or
`member`), and each workspace keeps its own customers and invoices.

## Run it

```bash
npm install
export LEDGER_JWT_SECRET=$(openssl rand -hex 32)
npm run seed      # creates data/ledger.db with two workspaces and demo users
npm start         # listens on :4100
```

Sign in to get a token:

```bash
curl -s localhost:4100/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"maya@northwind.test","password":"maya-demo-pw"}'
```

Then call the API with `Authorization: Bearer <token>`.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | email + password → token |
| GET | `/api/workspaces` | workspaces you belong to |
| GET | `/api/workspaces/:id/invoices` | filters: `status`, `customer`, `min_amount` (cents, inclusive), `sort` |
| POST | `/api/workspaces/:id/invoices` | create a draft invoice |
| POST | `/api/workspaces/:id/members` | owners and admins add members |
| GET | `/api/workspaces/:id/reports/summary` | totals by status |
| GET | `/api/workspaces/:id/reports/export.csv` | CSV for bookkeeping |
| GET / PATCH | `/api/invoices/:id` | read or change an invoice's status |

## Tests

```bash
npm test
```
