const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
const salaryService = require('./salary.service');
const expenseService = require('./expense.service');
const statementService = require('./statement.service');
const advanceService = require('./advance.service');
const impressService = require('./impress.service');
const localExpenseService = require('./localExpense.service');

const listSalaries = asyncHandler(async (req, res) => {
  const result = await salaryService.list(req.query);
  return ok(res, result.items, 'Salary records fetched', result.meta);
});

const createSalary = asyncHandler(async (req, res) => {
  const data = await salaryService.create(req.body, req.user);
  return created(res, data, 'Salary record saved');
});

const getSalary = asyncHandler(async (req, res) => {
  const data = await salaryService.getById(req.params.id);
  return ok(res, data, 'Salary record fetched');
});

const updateSalary = asyncHandler(async (req, res) => {
  const data = await salaryService.update(req.params.id, req.body);
  return ok(res, data, 'Salary record updated');
});

const voidSalary = asyncHandler(async (req, res) => {
  const data = await salaryService.voidRecord(req.params.id, req.body);
  return ok(res, data, 'Salary record voided');
});

const listExpenses = asyncHandler(async (req, res) => {
  const result = await expenseService.list(req.query);
  return ok(res, result.items, 'Expenses fetched', result.meta);
});

const createExpense = asyncHandler(async (req, res) => {
  const data = await expenseService.create(req.body, req.user);
  return created(res, data, 'Expense recorded');
});

const getExpense = asyncHandler(async (req, res) => {
  const data = await expenseService.getById(req.params.id);
  return ok(res, data, 'Expense fetched');
});

const updateExpense = asyncHandler(async (req, res) => {
  const data = await expenseService.update(req.params.id, req.body);
  return ok(res, data, 'Expense updated');
});

const voidExpense = asyncHandler(async (req, res) => {
  const data = await expenseService.voidRecord(req.params.id, req.body);
  return ok(res, data, 'Expense voided');
});

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

const listImpress = asyncHandler(async (req, res) => {
  const result = await impressService.list(req.query);
  return ok(res, {
    items: result.items,
    totals: result.totals,
  }, 'Impress entries fetched', result.meta);
});

const createImpress = asyncHandler(async (req, res) => {
  const data = await impressService.create(req.body, req.user);
  return created(res, data, 'Impress entry saved');
});

const getImpress = asyncHandler(async (req, res) => {
  const data = await impressService.getById(req.params.id);
  return ok(res, data, 'Impress entry fetched');
});

const updateImpress = asyncHandler(async (req, res) => {
  const data = await impressService.update(req.params.id, req.body);
  return ok(res, data, 'Impress entry updated');
});

const voidImpress = asyncHandler(async (req, res) => {
  const data = await impressService.voidRecord(req.params.id, req.body);
  return ok(res, data, 'Impress entry voided');
});

const deleteImpress = asyncHandler(async (req, res) => {
  await impressService.remove(req.params.id);
  return ok(res, null, 'Impress entry deleted');
});

const listLocalExpenses = asyncHandler(async (req, res) => {
  const result = await localExpenseService.list(req.query);
  return ok(res, {
    items: result.items,
    totals: result.totals,
  }, 'Local expenses fetched', result.meta);
});

const createLocalExpense = asyncHandler(async (req, res) => {
  const data = await localExpenseService.create(req.body, req.user);
  return created(res, data, 'Local expense saved');
});

const getLocalExpense = asyncHandler(async (req, res) => {
  const data = await localExpenseService.getById(req.params.id);
  return ok(res, data, 'Local expense fetched');
});

const updateLocalExpense = asyncHandler(async (req, res) => {
  const data = await localExpenseService.update(req.params.id, req.body);
  return ok(res, data, 'Local expense updated');
});

const deleteLocalExpense = asyncHandler(async (req, res) => {
  await localExpenseService.remove(req.params.id);
  return ok(res, null, 'Local expense deleted');
});

const employeeRelatedSite = asyncHandler(async (req, res) => {
  const data = await localExpenseService.employeeRelatedSite(req.params.employeeId);
  return ok(res, data, 'Related site fetched');
});

module.exports = {
  listSalaries,
  createSalary,
  getSalary,
  updateSalary,
  voidSalary,
  listExpenses,
  createExpense,
  getExpense,
  updateExpense,
  voidExpense,
  summary,
  statement,
  listAdvances,
  createAdvance,
  getAdvance,
  updateAdvance,
  recoverAdvance,
  voidAdvance,
  listImpress,
  createImpress,
  getImpress,
  updateImpress,
  voidImpress,
  deleteImpress,
  listLocalExpenses,
  createLocalExpense,
  getLocalExpense,
  updateLocalExpense,
  deleteLocalExpense,
  employeeRelatedSite,
};
