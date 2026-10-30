const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { roundMoney } = require('../../common/utils/money');
const { parseSort, containsRegex, startOfUtcDay, endOfUtcDay } = require('../../common/utils/helpers');
const Impress = require('./impress.model');
const LocalExpense = require('./localExpense.model');
const Employee = require('../employees/employee.model');
const Site = require('../sites/site.model');
const { pairKey, allocateBalances, withBalance, balanceTotals } = require('./impressMath');

const SORT_FIELDS = ['date', 'given', 'code', 'createdAt'];
const POPULATE = [
  { path: 'employee', select: 'fullName code designation' },
  { path: 'site', select: 'name code' },
];

function presentImpress(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const employee = json.employee && json.employee.id
    ? {
      id: json.employee.id,
      fullName: json.employee.fullName,
      code: json.employee.code,
      designation: json.employee.designation,
    }
    : json.employee;
  const site = json.site && json.site.id
    ? {
      id: json.site.id,
      name: json.site.name,
      code: json.site.code,
    }
    : json.site;
  return {
    id: json.id,
    code: json.code,
    date: json.date,
    employee,
    site,
    description: json.description,
    given: json.given,
    notes: json.notes || '',
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    isVoid: json.isVoid,
    voidReason: json.voidReason || '',
    voidedAt: json.voidedAt || null,
  };
}

async function loadPairBalances(docs) {
  if (!docs.length) return new Map();
  const or = [];
  const seen = new Set();
  for (const doc of docs) {
    const employee = doc.employee && (doc.employee._id || doc.employee.id)
      ? (doc.employee._id || doc.employee.id)
      : doc.employee;
    const site = doc.site && (doc.site._id || doc.site.id)
      ? (doc.site._id || doc.site.id)
      : doc.site;
    const key = pairKey(employee, site);
    if (seen.has(key)) continue;
    seen.add(key);
    or.push({ employee, site });
  }
  const [impressDocs, localDocs] = await Promise.all([
    Impress.find({ isVoid: false, $or: or }).select('employee site given date').sort({ date: 1 }),
    LocalExpense.find({ isVoid: false, $or: or }).select('employee site cashGiven returnAmount date').sort({ date: 1 }),
  ]);
  return allocateBalances(impressDocs, localDocs);
}

async function present(id) {
  const doc = await Impress.findById(id).populate(POPULATE);
  if (!doc) throw new AppError('Impress entry not found', 404, 'NOT_FOUND');
  const balances = await loadPairBalances([doc]);
  return withBalance(presentImpress(doc), balances.get(String(doc._id)));
}

async function buildPayload(body) {
  if (!(Number(body.given) > 0)) {
    throw new AppError('Given amount must be greater than zero', 400, 'BAD_REQUEST');
  }
  await Promise.all([
    requireDoc(Employee, body.employeeId, 'Employee', { isDeleted: false }),
    requireDoc(Site, body.siteId, 'Site', { isDeleted: false }),
  ]);
  return {
    date: body.date || new Date(),
    employee: body.employeeId,
    site: body.siteId,
    description: body.description,
    given: roundMoney(body.given),
    notes: body.notes || '',
  };
}

async function create(body, user) {
  const payload = await buildPayload(body);
  const doc = await Impress.create({
    ...payload,
    code: await nextCode('impress', 'IMP'),
    createdBy: user && user.id,
    isVoid: false,
  });
  return present(doc.id);
}

async function list(query) {
  const filter = {};
  if (!query.includeVoid) filter.isVoid = false;
  if (query.employeeId) filter.employee = new mongoose.Types.ObjectId(query.employeeId);
  if (query.siteId) filter.site = new mongoose.Types.ObjectId(query.siteId);
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ code: pattern }, { description: pattern }, { notes: pattern }];
  }
  if (query.from || query.to) {
    const from = query.from ? startOfUtcDay(new Date(query.from)) : new Date(0);
    const to = query.to ? endOfUtcDay(new Date(query.to)) : new Date();
    if (from > to) throw new AppError('from must be earlier than or equal to to', 400, 'BAD_REQUEST');
    filter.date = { $gte: from, $lte: to };
  }

  const result = await new BaseRepository(Impress).paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS, { date: -1 }),
    populate: POPULATE,
  });
  const allForFilter = await Impress.find(filter).select('employee site given date');
  const balances = await loadPairBalances(allForFilter.length ? allForFilter : result.items);
  result.items = result.items.map((doc) => (
    withBalance(presentImpress(doc), balances.get(String(doc._id)))
  ));
  const totaled = allForFilter.map((doc) => (
    withBalance({ given: doc.given }, balances.get(String(doc._id)))
  ));
  result.totals = balanceTotals(totaled);
  return result;
}

function getById(id) {
  return present(id);
}

async function update(id, body) {
  if (!body || !Object.keys(body).length) {
    throw new AppError('Send at least one field to update', 400, 'BAD_REQUEST');
  }
  const existing = await Impress.findById(id);
  if (!existing || existing.isVoid) throw new AppError('Impress entry not found', 404, 'NOT_FOUND');

  const merged = {
    employeeId: body.employeeId !== undefined ? body.employeeId : String(existing.employee),
    siteId: body.siteId !== undefined ? body.siteId : String(existing.site),
    date: body.date !== undefined ? body.date : existing.date,
    description: body.description !== undefined ? body.description : existing.description,
    given: body.given !== undefined ? body.given : existing.given,
    notes: body.notes !== undefined ? body.notes : existing.notes,
  };

  const payload = await buildPayload(merged);
  Object.assign(existing, payload);
  await existing.save();
  return present(existing.id);
}

async function voidRecord(id, body) {
  const doc = await Impress.findById(id);
  if (!doc || doc.isVoid) throw new AppError('Impress entry not found', 404, 'NOT_FOUND');
  doc.isVoid = true;
  doc.voidReason = body.reason;
  doc.voidedAt = new Date();
  await doc.save();
  return present(doc.id);
}

async function remove(id) {
  const doc = await Impress.findById(id);
  if (!doc) throw new AppError('Impress entry not found', 404, 'NOT_FOUND');
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, voidRecord, remove };
