const mongoose = require('mongoose');
const { CURRENCY } = require('../../config/constants');
const requireDoc = require('../../common/utils/requireDoc');
const { resolveRange } = require('../../common/utils/helpers');
const { roundMoney } = require('../../common/utils/money');
const Employee = require('../employees/employee.model');
const Expense = require('./expense.model');
const PayrollPayment = require('./payroll.model');

const LINE_LIMIT = 300;

function payrollRangeMatch(range, extra = {}) {
  return {
    ...extra,
    $expr: {
      $let: {
        vars: {
          periodDate: {
            $dateFromParts: { year: '$periodYear', month: '$periodMonth', day: 1 },
          },
        },
        in: {
          $and: [
            { $gte: ['$$periodDate', range.from] },
            { $lte: ['$$periodDate', range.to] },
          ],
        },
      },
    },
  };
}

async function payrollTotals(match) {
  const [row] = await PayrollPayment.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        basic: { $sum: '$basic' },
        extraShifts: { $sum: '$extraShifts' },
        advanceRecovery: { $sum: '$advanceRecovery' },
        netPay: { $sum: '$netPay' },
      },
    },
  ]);

  if (!row) {
    return {
      count: 0,
      basic: 0,
      extraShifts: 0,
      advanceRecovery: 0,
      netPay: 0,
      amountPaid: 0,
    };
  }

  return {
    count: row.count,
    basic: roundMoney(row.basic || 0),
    extraShifts: roundMoney(row.extraShifts || 0),
    advanceRecovery: roundMoney(row.advanceRecovery || 0),
    netPay: roundMoney(row.netPay || 0),
    amountPaid: roundMoney(row.netPay || 0),
  };
}

async function expenseTotals(match) {
  const rows = await Expense.aggregate([
    { $match: match },
    { $group: { _id: '$category', count: { $sum: 1 }, total: { $sum: '$amount' } } },
  ]);

  const byCategory = {};
  let count = 0;
  let totalAmount = 0;
  for (const row of rows) {
    byCategory[row._id] = { count: row.count, total: row.total };
    count += row.count;
    totalAmount += row.total;
  }

  return { count, totalAmount, byCategory };
}

async function summary(query) {
  const range = resolveRange(query, 1);
  const payrollExtra = {};
  const expenseExtra = { isVoid: false, expenseDate: { $gte: range.from, $lte: range.to } };
  if (query.projectId) {
    const projectId = new mongoose.Types.ObjectId(query.projectId);
    expenseExtra.project = projectId;
  }

  const [payroll, expenses] = await Promise.all([
    payrollTotals(payrollRangeMatch(range, payrollExtra)),
    expenseTotals(expenseExtra),
  ]);

  return {
    currency: CURRENCY,
    range,
    payroll,
    expenses,
    recordedOutflow: roundMoney(payroll.amountPaid + expenses.totalAmount),
  };
}

function categoryTotal(expenses, category) {
  return expenses.byCategory[category] ? expenses.byCategory[category].total : 0;
}

async function employeeStatement(employeeId, query) {
  const employee = await requireDoc(Employee, employeeId, 'Employee');
  const range = resolveRange(query, 12);
  const payrollMatch = payrollRangeMatch(range, { employee: employee._id });
  const expenseMatch = {
    isVoid: false,
    employee: employee._id,
    expenseDate: { $gte: range.from, $lte: range.to },
  };

  const [payroll, expenses, payrollLines, expenseLines] = await Promise.all([
    payrollTotals(payrollMatch),
    expenseTotals(expenseMatch),
    PayrollPayment.find(payrollMatch)
      .sort({ periodYear: -1, periodMonth: -1 })
      .limit(LINE_LIMIT)
      .lean(),
    Expense.find(expenseMatch).sort({ expenseDate: -1 }).limit(LINE_LIMIT),
  ]);

  return {
    currency: CURRENCY,
    range,
    employee: {
      id: employee.id,
      code: employee.code,
      fullName: employee.fullName,
      designation: employee.designation,
      status: employee.status,
      profilePhoto: employee.profilePhoto || null,
      salary: employee.salary,
    },
    payroll: {
      ...payroll,
      lines: payrollLines,
      linesTruncated: payroll.count > payrollLines.length,
    },
    expenses: {
      ...expenses,
      lines: expenseLines,
      linesTruncated: expenses.count > expenseLines.length,
    },
    totals: {
      advancesGiven: categoryTotal(expenses, 'employee_advance'),
      reimbursements: categoryTotal(expenses, 'employee_reimbursement'),
      payrollPaid: payroll.amountPaid,
      recordedOutflow: roundMoney(
        payroll.amountPaid
        + categoryTotal(expenses, 'employee_advance')
        + categoryTotal(expenses, 'employee_extra')
        + categoryTotal(expenses, 'employee_reimbursement')
      ),
    },
  };
}

module.exports = { summary, employeeStatement };
