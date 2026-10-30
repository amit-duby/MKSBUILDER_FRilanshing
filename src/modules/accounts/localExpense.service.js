const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { roundMoney } = require('../../common/utils/money');
const { parseSort, containsRegex, startOfUtcDay, endOfUtcDay } = require('../../common/utils/helpers');
const LocalExpense = require('./localExpense.model');
const Employee = require('../employees/employee.model');
const Site = require('../sites/site.model');
const Assignment = require('../employees/assignment.model');

const SORT_FIELDS = ['date', 'cashGiven', 'returnAmount', 'code', 'createdAt'];
const POPULATE = [
  { path: 'employee', select: 'fullName code designation site' },
  { path: 'site', select: 'name code' },
];

function presentSite(site) {
  if (!site) return null;
  return {
    id: site.id || String(site._id),
    name: site.name,
    code: site.code,
  };
}

function presentEmployee(employee) {
  if (!employee) return null;
  return {
    id: employee.id || String(employee._id),
    fullName: employee.fullName,
    code: employee.code,
    designation: employee.designation,
  };
}

function presentLocalExpense(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const cashGiven = Number(json.cashGiven) || 0;
  const returnAmount = Number(json.returnAmount) || 0;
  return {
    id: json.id,
    code: json.code,
    date: json.date,
    employee: presentEmployee(json.employee),
    site: presentSite(json.site),
    cashGiven,
    expenseDetails: json.expenseDetails,
    returnAmount,
    spentAmount: roundMoney(cashGiven - returnAmount),
    paymentMode: json.paymentMode,
    receipt: json.receipt || null,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    isVoid: json.isVoid,
    voidReason: json.voidReason || '',
    voidedAt: json.voidedAt || null,
  };
}

async function present(id) {
  const doc = await LocalExpense.findById(id).populate(POPULATE);
  if (!doc) throw new AppError('Local expense not found', 404, 'NOT_FOUND');
  return presentLocalExpense(doc);
}

async function relatedSite(employee) {
  if (employee.site) {
    const site = await Site.findById(employee.site);
    if (site && !site.isDeleted) return site;
  }
  const assignment = await Assignment.findOne({ employee: employee._id, isCurrent: true })
    .sort({ startDate: -1 })
    .populate('site');
  if (assignment && assignment.site && !assignment.site.isDeleted) return assignment.site;
  return null;
}

async function employeeRelatedSite(employeeId) {
  const employee = await requireDoc(Employee, employeeId, 'Employee', { isDeleted: false });
  const site = await relatedSite(employee);
  return {
    employee: presentEmployee(employee),
    site: presentSite(site),
  };
}

async function buildPayload(body) {
  const cashGiven = roundMoney(body.cashGiven);
  const returnAmount = roundMoney(body.returnAmount || 0);
  if (!(cashGiven > 0)) {
    throw new AppError('Cash given must be greater than zero', 400, 'BAD_REQUEST');
  }
  if (returnAmount < 0) {
    throw new AppError('Return amount cannot be negative', 400, 'BAD_REQUEST');
  }
  if (returnAmount > cashGiven) {
    throw new AppError('Return amount cannot be more than cash given', 400, 'BAD_REQUEST');
  }

  const employee = await requireDoc(Employee, body.employeeId, 'Employee', { isDeleted: false });
  let siteId = body.siteId;
  if (!siteId) {
    const site = await relatedSite(employee);
    if (!site) {
      throw new AppError('This employee has no related site. Assign a site or send siteId', 400, 'BAD_REQUEST');
    }
    siteId = site.id;
  } else {
    await requireDoc(Site, siteId, 'Site', { isDeleted: false });
  }

  return {
    date: body.date || new Date(),
    employee: employee._id,
    site: siteId,
    cashGiven,
    expenseDetails: body.expenseDetails,
    returnAmount,
    paymentMode: body.paymentMode,
    receipt: body.receipt === undefined ? undefined : body.receipt,
  };
}

async function create(body, user) {
  const payload = await buildPayload(body);
  const doc = await LocalExpense.create({
    ...payload,
    receipt: payload.receipt || null,
    code: await nextCode('local_expense', 'LEX'),
    createdBy: user && user.id,
    isVoid: false,
  });
  return present(doc.id);
}

async function localExpenseTotals(filter) {
  const [row] = await LocalExpense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        cashGiven: { $sum: '$cashGiven' },
        returnAmount: { $sum: '$returnAmount' },
      },
    },
  ]);
  const cashGiven = roundMoney(row ? row.cashGiven : 0);
  const returnAmount = roundMoney(row ? row.returnAmount : 0);
  return {
    cashGiven,
    returnAmount,
    spentAmount: roundMoney(cashGiven - returnAmount),
  };
}

async function list(query) {
  const filter = {};
  if (!query.includeVoid) filter.isVoid = false;
  if (query.employeeId) filter.employee = new mongoose.Types.ObjectId(query.employeeId);
  if (query.siteId) filter.site = new mongoose.Types.ObjectId(query.siteId);
  if (query.paymentMode) filter.paymentMode = query.paymentMode;
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ code: pattern }, { expenseDetails: pattern }];
  }
  if (query.from || query.to) {
    const from = query.from ? startOfUtcDay(new Date(query.from)) : new Date(0);
    const to = query.to ? endOfUtcDay(new Date(query.to)) : new Date();
    if (from > to) throw new AppError('from must be earlier than or equal to to', 400, 'BAD_REQUEST');
    filter.date = { $gte: from, $lte: to };
  }

  const [result, totals] = await Promise.all([
    new BaseRepository(LocalExpense).paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, SORT_FIELDS, { date: -1 }),
      populate: POPULATE,
    }),
    localExpenseTotals(filter),
  ]);
  result.items = result.items.map(presentLocalExpense);
  result.totals = totals;
  return result;
}

function getById(id) {
  return present(id);
}

async function update(id, body) {
  if (!body || !Object.keys(body).length) {
    throw new AppError('Send at least one field to update', 400, 'BAD_REQUEST');
  }
  const existing = await LocalExpense.findById(id);
  if (!existing || existing.isVoid) throw new AppError('Local expense not found', 404, 'NOT_FOUND');

  const merged = {
    employeeId: body.employeeId !== undefined ? body.employeeId : String(existing.employee),
    siteId: body.siteId !== undefined ? body.siteId : String(existing.site),
    date: body.date !== undefined ? body.date : existing.date,
    cashGiven: body.cashGiven !== undefined ? body.cashGiven : existing.cashGiven,
    expenseDetails: body.expenseDetails !== undefined ? body.expenseDetails : existing.expenseDetails,
    returnAmount: body.returnAmount !== undefined ? body.returnAmount : existing.returnAmount,
    paymentMode: body.paymentMode !== undefined ? body.paymentMode : existing.paymentMode,
    receipt: body.receipt !== undefined ? body.receipt : existing.receipt,
  };

  const payload = await buildPayload(merged);
  Object.assign(existing, payload);
  await existing.save();
  return present(existing.id);
}

async function remove(id) {
  const doc = await LocalExpense.findById(id);
  if (!doc) throw new AppError('Local expense not found', 404, 'NOT_FOUND');
  await doc.deleteOne();
}

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
  employeeRelatedSite,
};
