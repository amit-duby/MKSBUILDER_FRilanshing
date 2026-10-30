const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeSalary } = require('../src/modules/accounts/salaryMath');
const { assertSalaryPatchAllowed } = require('../src/modules/accounts/salaryLock');
const { assertExpenseShape } = require('../src/modules/accounts/expenseRules');
const { planStockMovement, reversePlan } = require('../src/modules/inventory/stockPlan');
const { resolveRange } = require('../src/common/utils/helpers');
const { allocateBalances } = require('../src/modules/accounts/impressMath');

describe('salary sheet math', () => {
  it('keeps gross, extras, deductions, and the recorded amount paid apart', () => {
    const sheet = computeSalary({
      baseAmount: 20000,
      allowances: [{ name: 'HRA', amount: 5000 }],
      deductions: [{ name: 'PF', amount: 1500 }],
      extras: [{ name: 'Overtime', amount: 2000 }],
      amountPaid: 22000,
    });

    assert.equal(sheet.grossAmount, 25000);
    assert.equal(sheet.totalExtras, 2000);
    assert.equal(sheet.netAmount, 25500);
    assert.equal(sheet.amountPaid, 22000);
    assert.equal(sheet.outstandingAmount, 3500);
    assert.equal(sheet.overpaidAmount, 0);
  });

  it('shows extra money recorded above the net sheet', () => {
    const sheet = computeSalary({
      baseAmount: 10000,
      allowances: [],
      deductions: [],
      extras: [],
      amountPaid: 10500,
    });

    assert.equal(sheet.netAmount, 10000);
    assert.equal(sheet.balanceAmount, -500);
    assert.equal(sheet.overpaidAmount, 500);
    assert.equal(sheet.outstandingAmount, 0);
  });

  it('rejects deductions that wipe out the sheet', () => {
    assert.throws(
      () => computeSalary({
        baseAmount: 1000,
        deductions: [{ name: 'Penalty', amount: 1500 }],
        amountPaid: 0,
      }),
      (error) => error.code === 'BAD_REQUEST'
    );
  });
});

describe('salary sheet lock', () => {
  it('allows a recorded sheet to store the amount paid', () => {
    assert.doesNotThrow(() => assertSalaryPatchAllowed('recorded', {
      amountPaid: 1000,
      remarks: 'Paid in cash outside the ERP',
    }));
  });

  it('blocks figure changes until the sheet is reopened', () => {
    assert.throws(
      () => assertSalaryPatchAllowed('recorded', { baseAmount: 1, recordStatus: 'draft' }),
      (error) => error.code === 'SALARY_LOCKED'
    );
  });

  it('allows draft sheets to change figures', () => {
    assert.doesNotThrow(() => assertSalaryPatchAllowed('draft', { baseAmount: 1 }));
  });
});

describe('expense shape', () => {
  it('requires an employee for salary-related expenses', () => {
    assert.throws(
      () => assertExpenseShape({ category: 'employee_extra' }),
      (error) => error.code === 'BAD_REQUEST'
    );
  });

  it('requires a vehicle for vehicle expenses and a payee for contractors', () => {
    assert.throws(
      () => assertExpenseShape({ category: 'vehicle' }),
      (error) => error.code === 'BAD_REQUEST'
    );
    assert.throws(
      () => assertExpenseShape({ category: 'contractor' }),
      (error) => error.code === 'BAD_REQUEST'
    );
  });

  it('accepts a material expense without an inventory link', () => {
    assert.doesNotThrow(() => assertExpenseShape({
      category: 'material',
      payeeName: 'Sharma Traders',
    }));
  });
});

describe('stock movement plan', () => {
  it('receives stock into one location', () => {
    const plan = planStockMovement({ type: 'receipt', quantity: 10.5, toLocationId: 'loc-1' });
    assert.equal(plan.quantity, 10.5);
    assert.deepEqual(plan.increase, [{ locationId: 'loc-1', quantity: 10.5 }]);
    assert.equal(plan.decrease.length, 0);
  });

  it('refuses a transfer to the same location and issues against item stock when no location is sent', () => {
    assert.throws(
      () => planStockMovement({ type: 'transfer', quantity: 2, fromLocationId: 'a', toLocationId: 'a' }),
      (error) => error.statusCode === 400
    );
    const plan = planStockMovement({ type: 'issue', quantity: 2 });
    assert.equal(plan.decrease[0].locationId, null);
    assert.equal(plan.decrease[0].quantity, 2);
  });

  it('reverses a receipt into a decrease', () => {
    const reversed = reversePlan(planStockMovement({ type: 'receipt', quantity: 8, toLocationId: 'loc-1' }));
    assert.equal(reversed.decrease[0].locationId, 'loc-1');
    assert.equal(reversed.decrease[0].quantity, 8);
    assert.equal(reversed.increase.length, 0);
  });

  it('decreases stock for an adjustment', () => {
    const plan = planStockMovement({
      type: 'adjustment',
      quantity: 1,
      direction: 'decrease',
      fromLocationId: 'loc-1',
    });
    assert.equal(plan.decrease[0].locationId, 'loc-1');
    assert.equal(plan.increase.length, 0);
  });
});

describe('report range', () => {
  it('rejects an inverted range', () => {
    assert.throws(
      () => resolveRange({ from: '2026-05-10', to: '2026-05-01' }),
      (error) => error.code === 'BAD_REQUEST'
    );
  });
});

describe('impress brought amount', () => {
  it('is given impress minus local receive, still with them', () => {
    const employee = 'emp-1';
    const site = 'site-1';
    const balances = allocateBalances(
      [{ _id: 'imp-1', employee, site, given: 10000, date: '2026-10-01' }],
      [{ employee, site, cashGiven: 8000, returnAmount: 2000, date: '2026-10-05' }]
    );
    const row = balances.get('imp-1');
    assert.equal(row.localReceiveAmount, 6000);
    assert.equal(row.broughtAmount, 4000);
  });
});
