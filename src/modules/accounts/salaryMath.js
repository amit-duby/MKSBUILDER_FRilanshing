/**
 * Salary-sheet arithmetic.
 * amountPaid is a number the owner records after paying the employee outside this ERP.
 * This module never sends, schedules, or authorizes a payment.
 */
const AppError = require('../../common/errors/AppError');
const { roundMoney, sumMoney } = require('../../common/utils/money');

function normalizeLines(lines) {
  return (lines || []).map((line) => ({
    name: String(line.name).trim(),
    amount: roundMoney(line.amount),
  }));
}

function computeSalary(input) {
  const baseAmount = roundMoney(input.baseAmount);
  const allowances = normalizeLines(input.allowances);
  const deductions = normalizeLines(input.deductions);
  const extras = normalizeLines(input.extras);
  const grossAmount = roundMoney(baseAmount + sumMoney(allowances));
  const totalDeductions = sumMoney(deductions);
  const totalExtras = sumMoney(extras);
  const netAmount = roundMoney(grossAmount - totalDeductions + totalExtras);

  if (netAmount < 0) {
    throw new AppError(
      'Deductions cannot be greater than gross salary plus extras',
      400,
      'BAD_REQUEST'
    );
  }

  const amountPaid = roundMoney(input.amountPaid || 0);
  const balanceAmount = roundMoney(netAmount - amountPaid);

  return {
    baseAmount,
    allowances,
    deductions,
    extras,
    grossAmount,
    totalDeductions,
    totalExtras,
    netAmount,
    amountPaid,
    balanceAmount,
    outstandingAmount: balanceAmount > 0 ? balanceAmount : 0,
    overpaidAmount: balanceAmount < 0 ? roundMoney(Math.abs(balanceAmount)) : 0,
  };
}

module.exports = { computeSalary };
