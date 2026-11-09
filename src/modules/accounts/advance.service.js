const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { roundMoney } = require('../../common/utils/money');
const { parseSort, containsRegex, startOfUtcDay, endOfUtcDay } = require('../../common/utils/helpers');
const { COLLECTIONS } = require('../../config/constants');
const Advance = require('./advance.model');
const Employee = require('../employees/employee.model');

const SORT_FIELDS = ['requestDate', 'advanceAmount', 'monthlySalary', 'code', 'createdAt'];
const POPULATE = [
  { path: 'employee', select: 'fullName code designation' },
  { path: 'department', select: 'name code' },
];

function initialsOf(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return '';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

function asObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return new mongoose.Types.ObjectId(String(value));
}

function workingDaysFor(query) {
  if (query.periodYear && query.periodMonth) {
    return new Date(Date.UTC(query.periodYear, query.periodMonth, 0)).getUTCDate();
  }
  return 25;
}

function periodDateFilter(query) {
  if (query.from || query.to) {
    const from = query.from ? startOfUtcDay(new Date(query.from)) : new Date(0);
    const to = query.to ? endOfUtcDay(new Date(query.to)) : new Date();
    if (from > to) throw new AppError('from must be earlier than or equal to to', 400, 'BAD_REQUEST');
    return { $gte: from, $lte: to };
  }
  if (query.periodYear && query.periodMonth) {
    const from = new Date(Date.UTC(query.periodYear, query.periodMonth - 1, 1));
    const to = endOfUtcDay(new Date(Date.UTC(query.periodYear, query.periodMonth, 0)));
    return { $gte: from, $lte: to };
  }
  return null;
}

function monthlySalaryOf(employee) {
  const base = employee.salary && employee.salary.baseAmount;
  return roundMoney(Number(base) || 0);
}

async function presentDoc(doc) {
  if (!doc) throw new AppError('Advance request not found', 404, 'NOT_FOUND');
  await doc.populate(POPULATE);
  return presentAdvance(doc);
}

async function present(id) {
  const doc = await Advance.findById(id).populate(POPULATE).lean({ virtuals: true });
  if (!doc) throw new AppError('Advance request not found', 404, 'NOT_FOUND');
  if (doc._id && doc.id == null) doc.id = String(doc._id);
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
  const employee = await requireDoc(Employee, body.employeeId, 'Employee');
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

async function listPayable(query) {
  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;
  const workingDays = workingDaysFor(query);

  const match = { isVoid: false };
  if (query.employeeId) match.employee = asObjectId(query.employeeId);
  if (query.departmentId) match.department = asObjectId(query.departmentId);
  const requestDate = periodDateFilter(query);
  if (requestDate) match.requestDate = requestDate;

  const attendanceDate = requestDate || {
    $gte: startOfUtcDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    $lte: endOfUtcDay(new Date()),
  };

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: '$employee',
        advanceIds: { $push: '$_id' },
        basic: { $max: '$monthlySalary' },
        givenAmount: { $sum: '$advanceAmount' },
        recoveredAmount: { $sum: '$recoveredAmount' },
        outstandingAmount: {
          $sum: { $subtract: ['$advanceAmount', '$recoveredAmount'] },
        },
        latestRequestDate: { $max: '$requestDate' },
      },
    },
    {
      $lookup: {
        from: COLLECTIONS.employees,
        localField: '_id',
        foreignField: '_id',
        pipeline: [
          {
            $project: {
              fullName: 1,
              code: 1,
              designation: 1,
              status: 1,
              'salary.baseAmount': 1,
            },
          },
        ],
        as: 'employeeDocs',
      },
    },
    { $addFields: { employee: { $arrayElemAt: ['$employeeDocs', 0] } } },
    { $match: { employee: { $ne: null } } },
  ];

  if (query.search) {
    const pattern = containsRegex(query.search);
    pipeline.push({
      $match: {
        $or: [
          { 'employee.fullName': pattern },
          { 'employee.code': pattern },
          { 'employee.designation': pattern },
        ],
      },
    });
  }

  if (query.siteId) {
    const siteId = asObjectId(query.siteId);
    pipeline.push(
      {
        $lookup: {
          from: COLLECTIONS.employeeAssignments,
          let: { employeeId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$employee', '$$employeeId'] },
                    { $eq: ['$isCurrent', true] },
                    { $eq: ['$site', siteId] },
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: 'siteFilterMatch',
        },
      },
      { $match: { 'siteFilterMatch.0': { $exists: true } } }
    );
  }

  pipeline.push({
    $facet: {
      items: [
        { $sort: { latestRequestDate: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: COLLECTIONS.employeeAssignments,
            let: { employeeId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$employee', '$$employeeId'] },
                      { $eq: ['$isCurrent', true] },
                    ],
                  },
                },
              },
              { $sort: { startDate: -1 } },
              { $limit: 1 },
              {
                $lookup: {
                  from: COLLECTIONS.sites,
                  localField: 'site',
                  foreignField: '_id',
                  pipeline: [{ $project: { name: 1, code: 1 } }],
                  as: 'siteDocs',
                },
              },
              {
                $project: {
                  site: { $arrayElemAt: ['$siteDocs', 0] },
                },
              },
            ],
            as: 'assignmentDocs',
          },
        },
        {
          $lookup: {
            from: COLLECTIONS.impressAmounts,
            let: { employeeId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$employee', '$$employeeId'] } } },
              { $sort: { date: -1 } },
              { $limit: 1 },
              { $project: { note: 1, date: 1 } },
            ],
            as: 'impressDocs',
          },
        },
        {
          $lookup: {
            from: COLLECTIONS.attendance,
            let: { employeeId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$employee', '$$employeeId'] },
                  attendanceDate: attendanceDate,
                },
              },
              {
                $group: {
                  _id: null,
                  daysPresent: {
                    $sum: {
                      $switch: {
                        branches: [
                          { case: { $eq: ['$status', 'present'] }, then: 1 },
                          { case: { $eq: ['$status', 'half_day'] }, then: 0.5 },
                        ],
                        default: 0,
                      },
                    },
                  },
                },
              },
            ],
            as: 'attendanceDocs',
          },
        },
        {
          $addFields: {
            assignment: { $arrayElemAt: ['$assignmentDocs', 0] },
            impress: { $arrayElemAt: ['$impressDocs', 0] },
            attendance: { $arrayElemAt: ['$attendanceDocs', 0] },
          },
        },
        {
          $project: {
            employeeDocs: 0,
            assignmentDocs: 0,
            impressDocs: 0,
            attendanceDocs: 0,
            siteFilterMatch: 0,
          },
        },
      ],
      total: [{ $count: 'count' }],
      summary: [
        {
          $group: {
            _id: null,
            gross: { $sum: '$basic' },
            advanceRecovery: { $sum: '$recoveredAmount' },
            outstanding: { $sum: '$outstandingAmount' },
          },
        },
      ],
    },
  });

  const [facet = {}] = await Advance.aggregate(pipeline);
  const total = facet.total && facet.total[0] ? facet.total[0].count : 0;
  const summaryRow = facet.summary && facet.summary[0] ? facet.summary[0] : null;

  const items = (facet.items || []).map((row) => {
    const fullName = row.employee && row.employee.fullName ? row.employee.fullName : '';
    const basic = roundMoney(
      row.basic
      || (row.employee && row.employee.salary && row.employee.salary.baseAmount)
      || 0
    );
    const extraShifts = 0;
    const advanceRecovery = roundMoney(row.recoveredAmount || 0);
    const outstanding = roundMoney(row.outstandingAmount || 0);
    const netPay = roundMoney(basic + extraShifts - advanceRecovery);
    const site = row.assignment && row.assignment.site ? row.assignment.site : null;
    const impress = row.impress || null;
    const daysPresent = row.attendance && row.attendance.daysPresent
      ? Number(row.attendance.daysPresent)
      : 0;

    return {
      employeeId: String(row._id),
      advanceIds: (row.advanceIds || []).map((id) => String(id)),
      fullName,
      initials: initialsOf(fullName),
      employeeCode: row.employee && row.employee.code ? row.employee.code : '',
      siteId: site && site._id ? String(site._id) : null,
      siteName: site && site.name ? site.name : '',
      note: impress ? (impress.note || 'Imprest amount') : null,
      daysPresent,
      workingDays,
      basic,
      extraShifts,
      advance: outstanding > 0 ? outstanding : null,
      advanceRecovery,
      netPay,
      canPay: netPay > 0,
    };
  });

  const summary = {
    gross: roundMoney(summaryRow ? summaryRow.gross : 0),
    advanceRecovery: roundMoney(summaryRow ? summaryRow.advanceRecovery : 0),
    netPayable: roundMoney(
      summaryRow
        ? (summaryRow.gross || 0) - (summaryRow.advanceRecovery || 0)
        : 0
    ),
  };

  return {
    summary,
    items,
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

module.exports = { create, list, listPayable, getById, update, recover, voidRecord };
