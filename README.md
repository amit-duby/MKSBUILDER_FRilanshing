# MKS Construction ERP API

Backend for a construction business. Admin accounts register and log in, then track projects, sites, departments, employees, attendance, stock, vehicles, salary sheets, and expenses.

The API records money. It does not pay anyone. There is no payout, bank transfer, or payroll run. `amountPaid` and expense amounts are figures you enter after the money has already moved outside this system.

Books are kept in INR.

## Modules

| Module | What it stores |
| --- | --- |
| Auth | Register and login. The password is hashed before it is stored. The first account is open; later accounts can be created only by an admin. |
| Departments | Teams such as execution, stores, or accounts. |
| Projects | Client, dates, budget, and status. |
| Sites | Sites under a project. Creating a site also creates its store. |
| Employees | Person, department, agreed salary, and current site assignments. |
| Attendance | Daily attendance for every employee, including a site register and monthly totals. |
| Inventory | Items, stores, on-hand balances, and an append-only stock ledger. |
| Vehicles | Fleet, site assignment, maintenance, fuel, and document expiry. |
| Accounts | Monthly salary sheets, employee advances/extras/reimbursements, and other expenses. |
| Dashboard | Counts plus this month's recorded outflow. |

## Run locally

Requirements: Node.js 18 or newer, and MongoDB 7.

```bash
docker compose up -d
copy .env.example .env
npm install
npm run dev
```

Set `JWT_SECRET` to at least 32 characters. The API does not create a user from `.env`. Create the first admin with `POST /api/v1/auth/register`, then log in with that same email and password. After the first account exists, only an admin can register another account.

```bash
npm test
npm run smoke
npm start
```

`npm run smoke` needs MongoDB on `127.0.0.1:27017`. It uses a disposable database named `mks_erp_smoke` and deletes that database when it finishes.

Health check: `GET /api/v1/health`

Create the first admin, then log in:

```bash
curl -X POST http://localhost:4000/api/v1/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Owner\",\"email\":\"owner@mksbuilder.local\",\"password\":\"ChangeMe123!\"}"
```

Send the token as `Authorization: Bearer <token>`. Sample calls are in `examples/api.http`.

## Response shape

```json
{
  "success": true,
  "message": "Project created",
  "data": {},
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

List endpoints accept `page`, `limit` (max 100), `search`, and `sort` (`name` or `-createdAt`). Unknown sort fields are rejected. Master records are archived, not hard-deleted. Pass `includeArchived=true` to list them, and `POST /:id/restore` to bring one back.

## Salary and expenses

A salary sheet snapshots one employee for one month:

- gross = base + allowances
- net = gross - deductions + extras
- `amountPaid` is what you already handed over
- `outstandingAmount` is net minus the recorded payment, when that difference is positive
- `overpaidAmount` is the extra when the recorded payment is higher than the net

Extras on the sheet (overtime, bonus) are separate from an `employee_extra` expense, which is money paid outside the monthly sheet. Advances and reimbursements are their own expense categories. The API does not deduct an advance from a salary sheet automatically. Add a deduction line yourself if you want the sheet to show that recovery.

Once a sheet is `recorded`, you can update only `amountPaid`, `remarks`, or set `recordStatus` back to `draft`. Change the figures after reopening it. Voiding a sheet keeps it for history and frees that month so a replacement can be saved.

`paymentModeNote` on an expense (`cash`, `bank_transfer`, `upi`, `cheque`, `other`) is a label only.

Employee statement: `GET /api/v1/accounts/employees/:employeeId/statement`

Month summary: `GET /api/v1/accounts/summary`

Project cost rollup: `GET /api/v1/projects/:id/summary`

## Attendance

One employee has one attendance mark per calendar day. Marking the same employee and date again updates that mark.

`POST /api/v1/attendance` marks one person. `POST /api/v1/attendance/bulk` marks up to 200 people for the same day, which is the site register. Status is `present`, `absent`, `half_day`, `leave`, `weekly_off`, or `holiday`.

`checkIn` and `checkOut` accept `HH:mm` or a full timestamp, and only for present or half-day. A check-out clock time earlier than check-in is treated as the next morning. `GET /api/v1/attendance/register?date=2026-04-02&siteId=` lists the people on a site and whether they are marked. `GET /api/v1/attendance/summary` totals worked days: present counts as 1 and half-day as 0.5. Attendance does not change a salary sheet.

## Stock

Movement types are `receipt`, `issue`, `transfer`, `adjustment`, and `return`. Quantity is always positive. The source balance cannot go below zero. Movements are not deleted. Correct a mistake with an adjustment. On a standalone MongoDB server the update is atomic per balance; a replica set makes a transfer atomic end to end.

`GET /api/v1/inventory/stock/low` lists active items whose total on-hand quantity is at or below `reorderLevel`.

## Vehicles

A vehicle is `available`, `assigned`, `maintenance`, or `inactive`. Assign it to one active site. Release it before maintenance. Fuel and maintenance logs can also write an account expense when `recordExpense` is true. Leave that false if you will enter the expense yourself, so the cost is not recorded twice.

`GET /api/v1/vehicles/alerts?withinDays=30` lists insurance, fitness, permit, and pollution dates inside the window.

## Layout

```text
src/
  app.js                 Express app
  server.js              Database, main store, shutdown
  config/                Environment, constants, MongoDB
  common/                Errors, validation, repositories, middleware
  modules/<name>/        Model, validation, service, controller, routes
  routes/index.js        Mount modules here
  seed/                  Owner account and main store
```

A new module follows the department module: schema, Zod request schema, service, thin controller, router, then one line in `src/routes/index.js`. Reuse `buildController`, `BaseRepository`, `validate`, and `AppError`.

Business numbers that must stay stable (salary totals, stock plans) live in plain functions under the module and are covered by `npm test`.

## Production notes

- Put the API behind HTTPS.
- Set `NODE_ENV=production`, a long `JWT_SECRET`, a real admin password, and an explicit `CORS_ORIGIN`.
- Set `TRUST_PROXY=true` when a reverse proxy terminates TLS.
- Tokens last `JWT_EXPIRES_IN` (default 8 hours). Logout bumps the token version and signs every current token out.
- Login is limited to 20 attempts per 15 minutes. The rest of the API allows 1000 requests per 15 minutes.
- The image in `Dockerfile` expects `MONGODB_URI` and the other variables at runtime. `docker compose up -d` starts only MongoDB.
