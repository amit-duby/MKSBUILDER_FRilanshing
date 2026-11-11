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
  { path: 'employee', select: 'fullName code profilePhoto' },
  { path: 'project', select: 'name' },
  { path: 'site', select: 'name code' },
  { path: 'vehicle', select: 'registrationNumber code' },
  { path: 'item', select: 'name sku unit' },
];

async function presentDoc(doc) {
  if (!doc) throw new AppError('Expense not found', 404, 'NOT_FOUND');
  await doc.populate(POPULATE);
  return doc;
}

async function present(id) {
  const doc = await Expense.findById(id).populate(POPULATE).lean({ virtuals: true });
  if (!doc) throw new AppError('Expense not found', 404, 'NOT_FOUND');
  if (doc._id && doc.id == null) doc.id = String(doc._id);
  return doc;
}

async function buildPayload(body, options = {}) {
  assertExpenseShape(body);
  if (!(Number(body.amount) > 0)) {
    throw new AppError('Amount must be greater than zero', 400, 'BAD_REQUEST');
  }

  if (options.trustRefs) {
    if (!body.payeeName) {
      throw new AppError('Payee name is required', 400, 'BAD_REQUEST');
    }
    return {
      category: body.category,
      amount: roundMoney(body.amount),
      expenseDate: body.expenseDate || new Date(),
      description: body.description,
      payeeName: body.payeeName,
      employee: body.employeeId,
      project: body.projectId,
      site: body.siteId,
      vehicle: body.vehicleId,
      item: body.itemId,
      referenceNo: body.referenceNo || '',
      paymentModeNote: body.paymentModeNote,
    };
  }

  const [links, employee, vehicle, item] = await Promise.all([
    resolveProjectSite(body.projectId, body.siteId),
    body.employeeId ? requireDoc(Employee, body.employeeId, 'Employee') : null,
    body.vehicleId ? requireDoc(Vehicle, body.vehicleId, 'Vehicle') : null,
    body.itemId ? requireDoc(Item, body.itemId, 'Item') : null,
  ]);

  let payeeName = body.payeeName;
  if (employee && !payeeName) payeeName = employee.fullName;
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

async function create(body, user, options = {}) {
  const [payload, code] = await Promise.all([
    buildPayload(body, options),
    nextCode('expense', 'EXP'),
  ]);
  const doc = await Expense.create({
    ...payload,
    code,
    createdBy: user && user.id,
    isVoid: false,
  });
  if (options.present === false) return doc;
  return presentDoc(doc);
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
    lean: true,
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
  return presentDoc(existing);
}

async function voidRecord(id, body) {
  const doc = await Expense.findById(id);
  if (!doc || doc.isVoid) throw new AppError('Expense not found', 404, 'NOT_FOUND');
  doc.isVoid = true;
  doc.voidReason = body.reason;
  doc.voidedAt = new Date();
  await doc.save();
  return presentDoc(doc);
}

module.exports = { create, list, getById, update, voidRecord };
