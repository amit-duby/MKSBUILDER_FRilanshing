const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { roundMoney } = require('../../common/utils/money');
const { parseSort, containsRegex, startOfUtcDay, endOfUtcDay } = require('../../common/utils/helpers');
const { COLLECTIONS } = require('../../config/constants');
const Impress = require('./impress.model');
const LocalExpense = require('./localExpense.model');
const Employee = require('../employees/employee.model');
const Site = require('../sites/site.model');
const { allocateBalances, withBalance, balanceTotals } = require('./impressMath');

const SORT_FIELDS = ['date', 'given', 'code', 'createdAt'];
const BALANCE_SELECT = 'employee site given date';
const LOCAL_SELECT = 'employee site cashGiven returnAmount date';

const employeeLookup = {
  $lookup: {
    from: COLLECTIONS.employees,
    localField: 'employee',
    foreignField: '_id',
    pipeline: [{ $project: { fullName: 1, code: 1, designation: 1 } }],
    as: 'employee',
  },
};

const siteLookup = {
  $lookup: {
    from: COLLECTIONS.sites,
    localField: 'site',
    foreignField: '_id',
    pipeline: [{ $project: { name: 1, code: 1 } }],
    as: 'site',
  },
};

function asId(value) {
  if (!value) return value;
  if (value.id) return String(value.id);
  if (value._id) return String(value._id);
  return String(value);
}

function presentRef(doc, fields) {
  if (!doc) return doc;
  if (typeof doc !== 'object') return asId(doc);
  const presented = { id: asId(doc) };
  for (const field of fields) presented[field] = doc[field];
  return presented.id ? presented : doc;
}

function presentImpress(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const employee = Array.isArray(json.employee) ? json.employee[0] : json.employee;
  const site = Array.isArray(json.site) ? json.site[0] : json.site;
  return {
    id: asId(json),
    code: json.code,
    date: json.date,
    employee: presentRef(employee, ['fullName', 'code', 'designation']),
    site: presentRef(site, ['name', 'code']),
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

function withRowBalance(doc, balances) {
  return withBalance(presentImpress(doc), balances.get(asId(doc)));
}

function oid(value) {
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value);
}

function listFilter(query) {
  const filter = {};
  if (!query.includeVoid) filter.isVoid = false;
  if (query.employeeId) filter.employee = oid(query.employeeId);
  if (query.siteId) filter.site = oid(query.siteId);
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
  return filter;
}

function localFilter(query) {
  const filter = { isVoid: false };
  if (query.employeeId) filter.employee = oid(query.employeeId);
  if (query.siteId) filter.site = oid(query.siteId);
  if (query.from || query.to) {
    const from = query.from ? startOfUtcDay(new Date(query.from)) : new Date(0);
    const to = query.to ? endOfUtcDay(new Date(query.to)) : new Date();
    filter.date = { $gte: from, $lte: to };
  }
  return filter;
}

async function present(id) {
  const [doc] = await Impress.aggregate([
    { $match: { _id: oid(id) } },
    {
      $lookup: {
        from: COLLECTIONS.impressEntries,
        let: { emp: '$employee', siteId: '$site' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$employee', '$$emp'] },
                  { $eq: ['$site', '$$siteId'] },
                  { $eq: ['$isVoid', false] },
                ],
              },
            },
          },
          { $project: { employee: 1, site: 1, given: 1, date: 1 } },
        ],
        as: 'siblings',
      },
    },
    {
      $lookup: {
        from: COLLECTIONS.localExpenses,
        let: { emp: '$employee', siteId: '$site' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$employee', '$$emp'] },
                  { $eq: ['$site', '$$siteId'] },
                  { $eq: ['$isVoid', false] },
                ],
              },
            },
          },
          { $project: { employee: 1, site: 1, cashGiven: 1, returnAmount: 1, date: 1 } },
        ],
        as: 'locals',
      },
    },
    employeeLookup,
    { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
    siteLookup,
    { $unwind: { path: '$site', preserveNullAndEmptyArrays: true } },
  ]);
  if (!doc) throw new AppError('Impress entry not found', 404, 'NOT_FOUND');
  const balances = allocateBalances(doc.siblings && doc.siblings.length ? doc.siblings : [doc], doc.locals || []);
  return withRowBalance(doc, balances);
}

async function presentFast(doc, employee, site, extraImpress = [], extraLocals = []) {
  const selfId = asId(doc);
  const balances = allocateBalances(
    [...extraImpress.filter((row) => asId(row) !== selfId), doc],
    extraLocals
  );
  return withBalance(presentImpress({
    ...(typeof doc.toJSON === 'function' ? doc.toJSON() : doc),
    employee,
    site,
  }), balances.get(asId(doc)));
}

async function buildPayload(body) {
  if (!(Number(body.given) > 0)) {
    throw new AppError('Given amount must be greater than zero', 400, 'BAD_REQUEST');
  }
  const [employee, site] = await Promise.all([
    requireDoc(Employee, body.employeeId, 'Employee', { isDeleted: false }),
    requireDoc(Site, body.siteId, 'Site', { isDeleted: false }),
  ]);
  return {
    date: body.date || new Date(),
    employee,
    site,
    description: body.description,
    given: roundMoney(body.given),
    notes: body.notes || '',
  };
}

async function create(body, user) {
  const [payload, code, siblings, locals] = await Promise.all([
    buildPayload(body),
    nextCode('impress', 'IMP'),
    Impress.find({ isVoid: false, employee: body.employeeId, site: body.siteId }).select(BALANCE_SELECT).lean(),
    LocalExpense.find({ isVoid: false, employee: body.employeeId, site: body.siteId }).select(LOCAL_SELECT).lean(),
  ]);
  const doc = await Impress.create({
    date: payload.date,
    employee: payload.employee._id,
    site: payload.site._id,
    description: payload.description,
    given: payload.given,
    notes: payload.notes,
    code,
    createdBy: user && user.id,
    isVoid: false,
  });
  return presentFast(doc, payload.employee, payload.site, siblings, locals);
}

async function list(query) {
  const filter = listFilter(query);
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const sort = parseSort(query.sort, SORT_FIELDS, { date: -1 });
  const skip = (page - 1) * limit;

  const [facetRows, localDocs] = await Promise.all([
    Impress.aggregate([
      { $match: filter },
      {
        $facet: {
          items: [
            { $sort: sort },
            { $skip: skip },
            { $limit: limit },
            employeeLookup,
            { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
            siteLookup,
            { $unwind: { path: '$site', preserveNullAndEmptyArrays: true } },
          ],
          all: [{ $project: { employee: 1, site: 1, given: 1, date: 1 } }],
          meta: [{ $count: 'total' }],
        },
      },
    ]),
    LocalExpense.find(localFilter(query)).select(LOCAL_SELECT).lean(),
  ]);
  const facet = facetRows[0] || {};

  const items = facet.items || [];
  const allForFilter = facet.all || [];
  const total = facet.meta && facet.meta[0] ? facet.meta[0].total : 0;
  const balances = allocateBalances(allForFilter, localDocs);

  return {
    items: items.map((doc) => withRowBalance(doc, balances)),
    totals: balanceTotals(allForFilter.map((doc) => withBalance({ given: doc.given }, balances.get(String(doc._id))))),
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / limit),
    },
  };
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

  const [payload, siblings, locals] = await Promise.all([
    buildPayload(merged),
    Impress.find({ isVoid: false, employee: merged.employeeId, site: merged.siteId }).select(BALANCE_SELECT).lean(),
    LocalExpense.find({ isVoid: false, employee: merged.employeeId, site: merged.siteId }).select(LOCAL_SELECT).lean(),
  ]);
  Object.assign(existing, {
    date: payload.date,
    employee: payload.employee._id,
    site: payload.site._id,
    description: payload.description,
    given: payload.given,
    notes: payload.notes,
  });
  await existing.save();
  return presentFast(existing, payload.employee, payload.site, siblings, locals);
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
  const doc = await Impress.findById(id).select('_id').lean();
  if (!doc) throw new AppError('Impress entry not found', 404, 'NOT_FOUND');
  await Impress.deleteOne({ _id: doc._id });
}

module.exports = { create, list, getById, update, voidRecord, remove };
