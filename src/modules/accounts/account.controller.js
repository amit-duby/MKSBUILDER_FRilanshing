const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
const salaryService = require('./salary.service');
const expenseService = require('./expense.service');
const statementService = require('./statement.service');

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
};
