const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
const statementService = require('./statement.service');
const advanceService = require('./advance.service');
const payrollService = require('./payroll.service');

const summary = asyncHandler(async (req, res) => {
  const data = await statementService.summary(req.query);
  return ok(res, data, 'Account summary fetched');
});

const statement = asyncHandler(async (req, res) => {
  const data = await statementService.employeeStatement(req.params.employeeId, req.query);
  return ok(res, data, 'Employee statement fetched');
});

const listAdvances = asyncHandler(async (req, res) => {
  const result = await advanceService.list(req.query);
  return ok(res, {
    items: result.items,
    totals: result.totals,
  }, 'Advance requests fetched', result.meta);
});

const createAdvance = asyncHandler(async (req, res) => {
  const data = await advanceService.create(req.body, req.user);
  return created(res, data, 'Advance request saved');
});

const getAdvance = asyncHandler(async (req, res) => {
  const data = await advanceService.getById(req.params.id);
  return ok(res, data, 'Advance request fetched');
});

const updateAdvance = asyncHandler(async (req, res) => {
  const data = await advanceService.update(req.params.id, req.body);
  return ok(res, data, 'Advance request updated');
});

const recoverAdvance = asyncHandler(async (req, res) => {
  const data = await advanceService.recover(req.params.id, req.body, req.user);
  return ok(res, data, 'Advance recovery recorded');
});

const voidAdvance = asyncHandler(async (req, res) => {
  const data = await advanceService.voidRecord(req.params.id, req.body);
  return ok(res, data, 'Advance request voided');
});

const listPayroll = asyncHandler(async (req, res) => {
  const result = await payrollService.list(req.query);
  return ok(res, {
    periodMonth: result.periodMonth,
    periodYear: result.periodYear,
    workingDaysInMonth: result.workingDaysInMonth,
    payBasis: result.payBasis || null,
    summary: result.summary,
    items: result.items,
  }, 'Payroll sheet fetched', result.meta);
});

const getPayrollById = asyncHandler(async (req, res) => {
  const data = await payrollService.getById(req.params.id, req.query);
  return ok(res, data, 'Payroll row fetched');
});

const payPayroll = asyncHandler(async (req, res) => {
  const data = await payrollService.pay(req.body, req.user);
  return created(res, data, 'Payroll payment recorded');
});

module.exports = {
  summary,
  statement,
  listAdvances,
  createAdvance,
  getAdvance,
  updateAdvance,
  recoverAdvance,
  voidAdvance,
  listPayroll,
  getPayrollById,
  payPayroll,
};
