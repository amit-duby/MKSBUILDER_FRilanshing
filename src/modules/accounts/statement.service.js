const mongoose = require('mongoose');
const { CURRENCY } = require('../../config/constants');
const requireDoc = require('../../common/utils/requireDoc');
const { resolveRange } = require('../../common/utils/helpers');
const Employee = require('../employees/employee.model');
const SalaryRecord = require('./salary.model');
const Expense = require('./expense.model');

const LINE_LIMIT = 300;

function salaryRangeMatch(range, extra = {}) {
  return {
    isVoid: false,
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

async function salaryTotals(match) {
  const [row] = await SalaryRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        grossAmount: { $sum: '$grossAmount' },
        totalExtras: { $sum: '$totalExtras' },
        netAmount: { $sum: '$netAmount' },
        amountPaid: { $sum: '$amountPaid' },
        outstandingAmount: { $sum: '$outstandingAmount' },
        overpaidAmount: { $sum: '$overpaidAmount' },
      },
    },
  ]);

  if (!row) {
    return {
      count: 0,
      grossAmount: 0,
      totalExtras: 0,
      netAmount: 0,
      amountPaid: 0,
      outstandingAmount: 0,
      overpaidAmount: 0,
    };
  }

  delete row._id;
  return row;
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
  const salaryExtra = {};
  const expenseExtra = { isVoid: false, expenseDate: { $gte: range.from, $lte: range.to } };
  if (query.projectId) {
    const projectId = new mongoose.Types.ObjectId(query.projectId);
    salaryExtra.project = projectId;
    expenseExtra.project = projectId;
  }

  const [salaries, expenses] = await Promise.all([
    salaryTotals(salaryRangeMatch(range, salaryExtra)),
    expenseTotals(expenseExtra),
  ]);

  return {
    currency: CURRENCY,
    range,
    salaries,
    expenses,
    recordedOutflow: salaries.amountPaid + expenses.totalAmount,
  };
}

function categoryTotal(expenses, category) {
  return expenses.byCategory[category] ? expenses.byCategory[category].total : 0;
}

async function employeeStatement(employeeId, query) {
  const employee = await requireDoc(Employee, employeeId, 'Employee', { isDeleted: false });
  const range = resolveRange(query, 12);
  const salaryMatch = salaryRangeMatch(range, { employee: employee._id });
  const expenseMatch = {
    isVoid: false,
    employee: employee._id,
    expenseDate: { $gte: range.from, $lte: range.to },
  };

  const [salaries, expenses, salaryLines, expenseLines] = await Promise.all([
    salaryTotals(salaryMatch),
    expenseTotals(expenseMatch),
    SalaryRecord.find(salaryMatch).sort({ periodYear: -1, periodMonth: -1 }).limit(LINE_LIMIT),
    Expense.find(expenseMatch).sort({ expenseDate: -1 }).limit(LINE_LIMIT),
  ]);

  const extraPaid = salaries.totalExtras + categoryTotal(expenses, 'employee_extra');

  return {
    currency: CURRENCY,
    range,
    employee: {
      id: employee.id,
      code: employee.code,
      fullName: employee.fullName,
      designation: employee.designation,
      status: employee.status,
      salary: employee.salary,
    },
    salaries: {
      ...salaries,
      lines: salaryLines,
      linesTruncated: salaries.count > salaryLines.length,
    },
    expenses: {
      ...expenses,
      lines: expenseLines,
      linesTruncated: expenses.count > expenseLines.length,
    },
    totals: {
      extraPaid,
      advancesGiven: categoryTotal(expenses, 'employee_advance'),
      reimbursements: categoryTotal(expenses, 'employee_reimbursement'),
      amountPaidOnSalarySheets: salaries.amountPaid,
      salaryOutstanding: salaries.outstandingAmount,
      salaryOverpaid: salaries.overpaidAmount,
      recordedOutflow: salaries.amountPaid
        + categoryTotal(expenses, 'employee_advance')
        + categoryTotal(expenses, 'employee_extra')
        + categoryTotal(expenses, 'employee_reimbursement'),
    },
  };
}

module.exports = { summary, employeeStatement };
