const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { roundMoney } = require('../../common/utils/money');
const { parseSort, containsRegex, startOfUtcDay, endOfUtcDay } = require('../../common/utils/helpers');
const { resolveProjectSite } = require('../../common/utils/projectSite');
const { assertExpenseShape } = require('./expenseRules');
const Expense = require('./expense.model');
const Employee = require('../employees/employee.model');
const Vehicle = require('../vehicles/vehicle.model');
const Item = require('../inventory/item.model');

const SORT_FIELDS = ['expenseDate', 'amount', 'code', 'createdAt', 'category'];
const POPULATE = [
  { path: 'employee', select: 'fullName code' },
  { path: 'project', select: 'name code' },
  { path: 'site', select: 'name code' },
  { path: 'vehicle', select: 'registrationNumber code' },
  { path: 'item', select: 'name sku unit' },
];

function withLinks(query) {
  return query.populate(POPULATE);
}

async function present(id) {
  const doc = await withLinks(Expense.findById(id));
  if (!doc) throw new AppError('Expense not found', 404, 'NOT_FOUND');
  return doc;
}

async function buildPayload(body) {
  assertExpenseShape(body);
  if (!(Number(body.amount) > 0)) {
    throw new AppError('Amount must be greater than zero', 400, 'BAD_REQUEST');
  }

  const links = await resolveProjectSite(body.projectId, body.siteId);
  let payeeName = body.payeeName;

  if (body.employeeId) {
    const employee = await requireDoc(Employee, body.employeeId, 'Employee', { isDeleted: false });
    if (!payeeName) payeeName = employee.fullName;
  }
  if (body.vehicleId) {
    await requireDoc(Vehicle, body.vehicleId, 'Vehicle', { isDeleted: false });
  }
  if (body.itemId) {
    await requireDoc(Item, body.itemId, 'Item', { isDeleted: false });
  }
  if (!payeeName) {
    throw new AppError('Payee name is required', 400, 'BAD_REQUEST');
  }

  return {
    category: body.category,
    amount: roundMoney(body.amount),
    expenseDate: body.expenseDate || new Date(),
    description: body.description,
    payeeName,
    employee: body.employeeId,
    project: links.projectId,
    site: links.site ? links.site._id : undefined,
    vehicle: body.vehicleId,
    item: body.itemId,
    referenceNo: body.referenceNo || '',
    paymentModeNote: body.paymentModeNote,
  };
}

async function create(body, user) {
  const payload = await buildPayload(body);
  const doc = await Expense.create({
    ...payload,
    code: await nextCode('expense', 'EXP'),
    createdBy: user && user.id,
    isVoid: false,
  });
  return present(doc.id);
}

async function list(query) {
  const filter = {};
  if (!query.includeVoid) filter.isVoid = false;
  if (query.category) filter.category = query.category;
  if (query.employeeId) filter.employee = query.employeeId;
  if (query.projectId) filter.project = query.projectId;
  if (query.siteId) filter.site = query.siteId;
  if (query.vehicleId) filter.vehicle = query.vehicleId;
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ payeeName: pattern }, { description: pattern }, { code: pattern }, { referenceNo: pattern }];
  }
  if (query.from || query.to) {
    const from = query.from ? startOfUtcDay(new Date(query.from)) : new Date(0);
    const to = query.to ? endOfUtcDay(new Date(query.to)) : new Date();
    if (from > to) throw new AppError('from must be earlier than or equal to to', 400, 'BAD_REQUEST');
    filter.expenseDate = { $gte: from, $lte: to };
  }

  return new BaseRepository(Expense).paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS, { expenseDate: -1 }),
    populate: POPULATE,
  });
}

function getById(id) {
  return present(id);
}

async function update(id, body) {
  const existing = await Expense.findById(id);
  if (!existing || existing.isVoid) throw new AppError('Expense not found', 404, 'NOT_FOUND');

  const merged = {
    category: body.category || existing.category,
    amount: body.amount !== undefined ? body.amount : existing.amount,
    expenseDate: body.expenseDate || existing.expenseDate,
    description: body.description || existing.description,
    payeeName: body.payeeName !== undefined ? body.payeeName : existing.payeeName,
    employeeId: body.employeeId !== undefined ? body.employeeId : existing.employee,
    projectId: body.projectId !== undefined ? body.projectId : existing.project,
    siteId: body.siteId !== undefined ? body.siteId : existing.site,
    vehicleId: body.vehicleId !== undefined ? body.vehicleId : existing.vehicle,
    itemId: body.itemId !== undefined ? body.itemId : existing.item,
    referenceNo: body.referenceNo !== undefined ? body.referenceNo : existing.referenceNo,
    paymentModeNote: body.paymentModeNote !== undefined ? body.paymentModeNote : existing.paymentModeNote,
  };

  const payload = await buildPayload(merged);
  Object.assign(existing, payload);
  await existing.save();
  return present(existing.id);
}

async function voidRecord(id, body) {
  const doc = await Expense.findById(id);
  if (!doc || doc.isVoid) throw new AppError('Expense not found', 404, 'NOT_FOUND');
  doc.isVoid = true;
  doc.voidReason = body.reason;
  doc.voidedAt = new Date();
  await doc.save();
  return present(doc.id);
}

module.exports = { create, list, getById, update, voidRecord };
