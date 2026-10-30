const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { roundMoney } = require('../../common/utils/money');
const { parseSort, containsRegex, startOfUtcDay, endOfUtcDay } = require('../../common/utils/helpers');
const Advance = require('./advance.model');
const Employee = require('../employees/employee.model');

const SORT_FIELDS = ['requestDate', 'advanceAmount', 'monthlySalary', 'code', 'createdAt'];
const POPULATE = [
  { path: 'employee', select: 'fullName code designation' },
  { path: 'department', select: 'name code' },
];

function monthlySalaryOf(employee) {
  const base = employee.salary && employee.salary.baseAmount;
  return roundMoney(Number(base) || 0);
}

async function present(id) {
  const doc = await Advance.findById(id).populate(POPULATE);
  if (!doc) throw new AppError('Advance request not found', 404, 'NOT_FOUND');
  return presentAdvance(doc);
}

function presentAdvance(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const employee = json.employee && json.employee.id
    ? {
      id: json.employee.id,
      fullName: json.employee.fullName,
      code: json.employee.code,
      designation: json.employee.designation,
    }
    : json.employee;
  const department = json.department && json.department.id
    ? {
      id: json.department.id,
      name: json.department.name,
      code: json.department.code,
    }
    : json.department;
  return {
    id: json.id,
    code: json.code,
    employee,
    department,
    monthlySalary: json.monthlySalary,
    requestDate: json.requestDate,
    givenAmount: json.advanceAmount,
    advanceAmount: json.advanceAmount,
    recoveredAmount: json.recoveredAmount || 0,
    outstandingAmount: roundMoney((json.advanceAmount || 0) - (json.recoveredAmount || 0)),
    recoveries: json.recoveries || [],
    reasonForAdvance: json.reasonForAdvance,
    attachment: json.attachment,
    employeeRemarks: json.employeeRemarks,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    isVoid: json.isVoid,
    voidReason: json.voidReason || '',
    voidedAt: json.voidedAt || null,
  };
}

async function buildPayload(body) {
  const employee = await requireDoc(Employee, body.employeeId, 'Employee', { isDeleted: false });
  if (!(Number(body.advanceAmount) > 0)) {
    throw new AppError('Advance amount must be greater than zero', 400, 'BAD_REQUEST');
  }

  return {
    employee: employee._id,
    department: employee.department,
    monthlySalary: body.monthlySalary === undefined
      ? monthlySalaryOf(employee)
      : roundMoney(body.monthlySalary),
    requestDate: body.requestDate || new Date(),
    advanceAmount: roundMoney(body.advanceAmount),
    reasonForAdvance: body.reasonForAdvance,
    attachment: body.attachment === undefined ? undefined : body.attachment,
    employeeRemarks: body.employeeRemarks || '',
  };
}

async function create(body, user) {
  const payload = await buildPayload(body);
  const doc = await Advance.create({
    ...payload,
    attachment: payload.attachment || null,
    code: await nextCode('employee_advance', 'ADV'),
    recoveredAmount: 0,
    recoveries: [],
    createdBy: user && user.id,
    isVoid: false,
  });
  return present(doc.id);
}

async function advanceTotals(filter) {
  const [row] = await Advance.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        given: { $sum: '$advanceAmount' },
        recovered: { $sum: '$recoveredAmount' },
      },
    },
  ]);
  const given = roundMoney(row ? row.given : 0);
  const recovered = roundMoney(row ? row.recovered : 0);
  return {
    given,
    recovered,
    outstanding: roundMoney(given - recovered),
  };
}

async function list(query) {
  const filter = {};
  if (!query.includeVoid) filter.isVoid = false;
  if (query.employeeId) filter.employee = new mongoose.Types.ObjectId(query.employeeId);
  if (query.departmentId) filter.department = new mongoose.Types.ObjectId(query.departmentId);
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [
      { code: pattern },
      { reasonForAdvance: pattern },
      { employeeRemarks: pattern },
    ];
  }
  if (query.from || query.to) {
    const from = query.from ? startOfUtcDay(new Date(query.from)) : new Date(0);
    const to = query.to ? endOfUtcDay(new Date(query.to)) : new Date();
    if (from > to) throw new AppError('from must be earlier than or equal to to', 400, 'BAD_REQUEST');
    filter.requestDate = { $gte: from, $lte: to };
  }

  const [result, totals] = await Promise.all([
    new BaseRepository(Advance).paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, SORT_FIELDS, { requestDate: -1 }),
      populate: POPULATE,
    }),
    advanceTotals(filter),
  ]);
  result.items = result.items.map(presentAdvance);
  result.totals = totals;
  return result;
}

function getById(id) {
  return present(id);
}

async function update(id, body) {
  const existing = await Advance.findById(id);
  if (!existing || existing.isVoid) throw new AppError('Advance request not found', 404, 'NOT_FOUND');

  const merged = {
    employeeId: body.employeeId !== undefined ? body.employeeId : String(existing.employee),
    monthlySalary: body.monthlySalary !== undefined ? body.monthlySalary : existing.monthlySalary,
    requestDate: body.requestDate !== undefined ? body.requestDate : existing.requestDate,
    advanceAmount: body.advanceAmount !== undefined ? body.advanceAmount : existing.advanceAmount,
    reasonForAdvance: body.reasonForAdvance !== undefined ? body.reasonForAdvance : existing.reasonForAdvance,
    attachment: body.attachment !== undefined ? body.attachment : existing.attachment,
    employeeRemarks: body.employeeRemarks !== undefined ? body.employeeRemarks : existing.employeeRemarks,
  };

  const payload = await buildPayload(merged);
  if (payload.advanceAmount < (existing.recoveredAmount || 0)) {
    throw new AppError('Advance amount cannot be less than the recovered amount', 409, 'CONFLICT');
  }
  Object.assign(existing, payload);
  if (payload.attachment === undefined) existing.attachment = existing.attachment;
  await existing.save();
  return present(existing.id);
}

async function recover(id, body, user) {
  const doc = await Advance.findById(id);
  if (!doc || doc.isVoid) throw new AppError('Advance request not found', 404, 'NOT_FOUND');
  const amount = roundMoney(body.amount);
  if (!(amount > 0)) {
    throw new AppError('Recovered amount must be greater than zero', 400, 'BAD_REQUEST');
  }
  const nextRecovered = roundMoney((doc.recoveredAmount || 0) + amount);
  if (nextRecovered > doc.advanceAmount) {
    throw new AppError(
      `Recovered amount cannot exceed the given amount. Outstanding ${roundMoney(doc.advanceAmount - (doc.recoveredAmount || 0))}`,
      409,
      'CONFLICT'
    );
  }
  doc.recoveries.push({
    amount,
    recoveredAt: body.recoveredAt || new Date(),
    remarks: body.remarks || '',
    createdBy: user && user.id,
  });
  doc.recoveredAmount = nextRecovered;
  await doc.save();
  return present(doc.id);
}

async function voidRecord(id, body) {
  const doc = await Advance.findById(id);
  if (!doc || doc.isVoid) throw new AppError('Advance request not found', 404, 'NOT_FOUND');
  doc.isVoid = true;
  doc.voidReason = body.reason;
  doc.voidedAt = new Date();
  await doc.save();
  return present(doc.id);
}

module.exports = { create, list, getById, update, recover, voidRecord };
