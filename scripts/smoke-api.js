process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/mks_erp_smoke';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-secret-key-at-least-32-characters';
process.env.JWT_EXPIRES_IN = '1h';
process.env.CORS_ORIGIN = '*';
process.env.LOG_LEVEL = 'silent';

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { ensureMainStore } = require('../src/seed/ensureMainStore');
const { lastTestMail } = require('../src/common/mail/mailer');
const app = require('../src/app');

async function call(base, method, path, { token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
}

function expectStatus(result, status, label) {
  assert.equal(
    result.status,
    status,
    `${label} expected ${status}, got ${result.status}: ${JSON.stringify(result.json)}`
  );
  return result.json;
}

async function main() {
  await connectDatabase(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  const mainStore = await ensureMainStore();

  const server = app.listen(0);
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  try {
    expectStatus(await call(base, 'GET', '/health'), 200, 'health');

    const registered = expectStatus(await call(base, 'POST', '/auth/register', {
      body: { name: 'Smoke Owner', email: 'smoke-owner@mksbuilder.local', password: 'SmokePass123!' },
    }), 201, 'register');
    assert.equal(registered.data.user.role, 'admin');
    assert.equal(registered.data.user.passwordHash, undefined);

    const rejected = await call(base, 'POST', '/auth/register', {
      body: { name: 'Other', email: 'other@mksbuilder.local', password: 'SmokePass123!' },
    });
    assert.equal(rejected.status, 403);

    const login = expectStatus(await call(base, 'POST', '/auth/login', {
      body: { email: 'smoke-owner@mksbuilder.local', password: 'SmokePass123!' },
    }), 200, 'login');
    const token = login.data.token;

    expectStatus(await call(base, 'GET', '/dashboard', { token }), 200, 'dashboard');

    const department = expectStatus(await call(base, 'POST', '/departments', {
      token,
      body: { name: 'Execution' },
    }), 201, 'department').data;

    const project = expectStatus(await call(base, 'POST', '/projects', {
      token,
      body: {
        name: 'Riverfront',
        clientName: 'Agarwal Constructions',
        startDate: '2026-04-01',
        budgetAmount: 5000000,
        clientAmount: 1500000,
        status: 'active',
      },
    }), 201, 'project').data;
    assert.equal(project.clientAmount, 1500000);

    const site = expectStatus(await call(base, 'POST', '/sites', {
      token,
      body: { projectId: project.id, name: 'Tower A', startDate: '2026-04-01' },
    }), 201, 'site').data;

    const locations = expectStatus(await call(base, 'GET', `/inventory/locations?siteId=${site.id}`, { token }), 200, 'site store');
    assert.equal(locations.data.length, 1);
    assert.equal(locations.data[0].type, 'site_store');

    const employee = expectStatus(await call(base, 'POST', '/employees', {
      token,
      body: {
        fullName: 'Ravi Kumar',
        phone: '9811111111',
        departmentId: department.id,
        designation: 'Supervisor',
        employmentType: 'permanent',
        joiningDate: '2026-04-01',
        siteId: site.id,
        salary: {
          payBasis: 'monthly',
          baseAmount: 28000,
          allowances: [{ name: 'HRA', amount: 2000 }],
        },
      },
    }), 201, 'employee').data;
    assert.equal(employee.currentAssignments.length, 1);

    const marked = expectStatus(await call(base, 'POST', '/attendance', {
      token,
      body: {
        employeeId: employee.id,
        date: '2026-04-02',
        status: 'present',
        siteId: site.id,
        checkIn: '09:00',
        checkOut: '18:00',
        overtimeHours: 1,
      },
    }), 201, 'attendance').data;
    assert.equal(marked.status, 'present');
    assert.equal(marked.overtimeHours, 1);

    const revised = expectStatus(await call(base, 'POST', '/attendance', {
      token,
      body: {
        employeeId: employee.id,
        date: '2026-04-02',
        status: 'half_day',
        siteId: site.id,
        checkIn: '09:00',
        checkOut: '13:00',
      },
    }), 200, 'attendance update').data;
    assert.equal(revised.id, marked.id);
    assert.equal(revised.status, 'half_day');

    const absentWithTime = await call(base, 'POST', '/attendance', {
      token,
      body: {
        employeeId: employee.id,
        date: '2026-04-03',
        status: 'absent',
        checkIn: '09:00',
      },
    });
    assert.equal(absentWithTime.status, 400);

    const register = expectStatus(await call(
      base,
      'GET',
      `/attendance/register?date=2026-04-02&siteId=${site.id}`,
      { token }
    ), 200, 'attendance register').data;
    assert.equal(register.rows.length, 1);
    assert.equal(register.rows[0].attendance.status, 'half_day');

    const attendanceSummary = expectStatus(await call(
      base,
      'GET',
      '/attendance/summary?from=2026-04-01&to=2026-04-30',
      { token }
    ), 200, 'attendance summary').data;
    assert.equal(attendanceSummary.totals.workedDays, 0.5);
    assert.equal(attendanceSummary.totals.half_day, 1);

    const salary = expectStatus(await call(base, 'POST', '/accounts/salaries', {
      token,
      body: {
        employeeId: employee.id,
        projectId: project.id,
        siteId: site.id,
        periodMonth: 4,
        periodYear: 2026,
        deductions: [{ name: 'PF', amount: 500 }],
        extras: [{ name: 'Overtime', amount: 1500 }],
        amountPaid: 32000,
        recordStatus: 'recorded',
      },
    }), 201, 'salary').data;

    assert.equal(salary.grossAmount, 30000);
    assert.equal(salary.netAmount, 31000);
    assert.equal(salary.overpaidAmount, 1000);
    assert.equal(salary.outstandingAmount, 0);

    const locked = await call(base, 'PATCH', `/accounts/salaries/${salary.id}`, {
      token,
      body: { baseAmount: 1 },
    });
    assert.equal(locked.status, 400);
    assert.equal(locked.json.code, 'SALARY_LOCKED');

    const duplicate = await call(base, 'POST', '/accounts/salaries', {
      token,
      body: { employeeId: employee.id, periodMonth: 4, periodYear: 2026 },
    });
    assert.equal(duplicate.status, 409);

    expectStatus(await call(base, 'POST', '/accounts/expenses', {
      token,
      body: {
        category: 'employee_extra',
        amount: 800,
        expenseDate: '2026-04-18',
        employeeId: employee.id,
        projectId: project.id,
        description: 'Sunday overtime paid in cash',
        paymentModeNote: 'cash',
      },
    }), 201, 'extra expense');

    const statement = expectStatus(await call(
      base,
      'GET',
      `/accounts/employees/${employee.id}/statement?from=2026-04-01&to=2026-04-30`,
      { token }
    ), 200, 'statement').data;
    assert.equal(statement.totals.extraPaid, 2300);
    assert.equal(statement.totals.salaryOverpaid, 1000);

    const item = expectStatus(await call(base, 'POST', '/inventory/items', {
      token,
      body: { name: 'OPC Cement', category: 'Cement', unit: 'bag', reorderLevel: 20 },
    }), 201, 'item').data;

    expectStatus(await call(base, 'POST', '/inventory/movements', {
      token,
      body: {
        type: 'receipt',
        itemId: item.id,
        quantity: 10,
        toLocationId: mainStore.id,
        unitCost: 380,
      },
    }), 201, 'receipt');

    const shortage = await call(base, 'POST', '/inventory/movements', {
      token,
      body: {
        type: 'issue',
        itemId: item.id,
        quantity: 50,
        fromLocationId: mainStore.id,
        siteId: site.id,
        projectId: project.id,
      },
    });
    assert.equal(shortage.status, 409);
    assert.equal(shortage.json.code, 'STOCK_INSUFFICIENT');

    expectStatus(await call(base, 'POST', '/inventory/movements', {
      token,
      body: {
        type: 'issue',
        itemId: item.id,
        quantity: 4,
        fromLocationId: mainStore.id,
        siteId: site.id,
        projectId: project.id,
      },
    }), 201, 'issue');

    const stock = expectStatus(await call(base, 'GET', `/inventory/stock?itemId=${item.id}`, { token }), 200, 'stock');
    assert.equal(stock.data[0].quantity, 6);

    const low = expectStatus(await call(base, 'GET', '/inventory/stock/low', { token }), 200, 'low stock');
    assert.equal(low.data.some((row) => row.sku === item.sku), true);

    const vehicle = expectStatus(await call(base, 'POST', '/vehicles', {
      token,
      body: { registrationNumber: 'UP32AB1234', type: 'tipper', fuelType: 'diesel' },
    }), 201, 'vehicle').data;

    expectStatus(await call(base, 'POST', `/vehicles/${vehicle.id}/assign`, {
      token,
      body: { siteId: site.id, driverId: employee.id },
    }), 201, 'assign vehicle');

    const blockedMaintenance = await call(base, 'POST', `/vehicles/${vehicle.id}/maintenance`, {
      token,
      body: { type: 'service', description: 'Engine service', cost: 2000 },
    });
    assert.equal(blockedMaintenance.status, 409);

    expectStatus(await call(base, 'POST', `/vehicles/${vehicle.id}/release`, { token, body: {} }), 200, 'release');
    expectStatus(await call(base, 'POST', `/vehicles/${vehicle.id}/fuel-logs`, {
      token,
      body: {
        liters: 40,
        amount: 3600,
        siteId: site.id,
        recordExpense: true,
        payeeName: 'HP Pump',
        paymentModeNote: 'upi',
      },
    }), 201, 'fuel');

    const summary = expectStatus(await call(base, 'GET', `/projects/${project.id}/summary`, { token }), 200, 'summary').data;
    assert.equal(summary.accounts.expenseTotal, 4400);
    assert.equal(summary.accounts.salaryAmountPaid, 32000);
    assert.equal(summary.accounts.clientAmount, 1500000);
    assert.equal(summary.vehiclesAssigned, 0);
    assert.equal(summary.employeeCount, 1);

    const missingPayRoute = await call(base, 'POST', `/accounts/salaries/${salary.id}/pay`, {
      token,
      body: { amount: 100 },
    });
    assert.equal(missingPayRoute.status, 404);

    const unknownReset = await call(base, 'POST', '/auth/forgot-password', {
      body: { email: 'missing@mksbuilder.local' },
    });
    assert.equal(unknownReset.status, 404);

    const forgot = expectStatus(await call(base, 'POST', '/auth/forgot-password', {
      body: { email: 'smoke-owner@mksbuilder.local' },
    }), 200, 'forgot password');
    assert.equal(forgot.data.email, 'smoke-owner@mksbuilder.local');
    assert.equal(forgot.data.resetToken, undefined);

    const mail = lastTestMail();
    assert.equal(mail && mail.to, 'smoke-owner@mksbuilder.local');
    const emailedToken = (mail.text.match(/Reset token: ([a-f0-9]{64})/) || [])[1];
    assert.equal(typeof emailedToken, 'string');

    const badReset = await call(base, 'POST', '/auth/reset-password', {
      body: { token: 'a'.repeat(64), newPassword: 'SmokePass456!' },
    });
    assert.equal(badReset.status, 400);

    const reset = expectStatus(await call(base, 'POST', '/auth/reset-password', {
      body: { token: emailedToken, newPassword: 'SmokePass456!' },
    }), 200, 'reset password');
    const resetToken = reset.data.token;

    const oldPassword = await call(base, 'POST', '/auth/login', {
      body: { email: 'smoke-owner@mksbuilder.local', password: 'SmokePass123!' },
    });
    assert.equal(oldPassword.status, 401);

    const reused = await call(base, 'POST', '/auth/reset-password', {
      body: { token: emailedToken, newPassword: 'SmokePass789!' },
    });
    assert.equal(reused.status, 400);

    const afterReset = await call(base, 'GET', '/auth/me', { token });
    assert.equal(afterReset.status, 401);

    expectStatus(await call(base, 'POST', '/auth/login', {
      body: { email: 'smoke-owner@mksbuilder.local', password: 'SmokePass456!' },
    }), 200, 'login after reset');

    expectStatus(await call(base, 'POST', '/auth/logout', { token: resetToken }), 200, 'logout');
    const afterLogout = await call(base, 'GET', '/auth/me', { token: resetToken });
    assert.equal(afterLogout.status, 401);

    console.log('Smoke API passed');
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  }
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  } catch {
    // The connection may already be closed.
  }
  process.exit(1);
});
