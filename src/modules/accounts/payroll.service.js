const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const { roundMoney } = require('../../common/utils/money');
const { startOfUtcDay, endOfUtcDay } = require('../../common/utils/helpers');
const { COLLECTIONS } = require('../../config/constants');
const logger = require('../../common/utils/logger');
const { workedDayValue } = require('../attendance/attendanceRules');
const Employee = require('../employees/employee.model');
const Assignment = require('../employees/assignment.model');
const Attendance = require('../attendance/attendance.model');
const Advance = require('./advance.model');
const PayrollPayment = require('./payroll.model');

const IST_TZ = 'Asia/Kolkata';

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function workingDaysInMonth(year, month) {
  const total = daysInMonth(year, month);
  let sundays = 0;
  for (let day = 1; day <= total; day += 1) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0) sundays += 1;
  }
  return Math.max(total - sundays, 0);
}

function getIstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);

  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
  };
}

function currentIstPeriod(date = new Date()) {
  const { year, month } = getIstParts(date);
  return { periodMonth: month, periodYear: year };
}

function previousIstPeriod(date = new Date()) {
  const { year, month } = getIstParts(date);
  if (month === 1) return { periodMonth: 12, periodYear: year - 1 };
  return { periodMonth: month - 1, periodYear: year };
}

function resolvePeriod(query = {}) {
  const hasMonth = query.periodMonth !== undefined && query.periodMonth !== null && query.periodMonth !== '';
  const hasYear = query.periodYear !== undefined && query.periodYear !== null && query.periodYear !== '';

  if (hasMonth || hasYear) {
    const periodMonth = Number(query.periodMonth);
    const periodYear = Number(query.periodYear);
    if (!(periodMonth >= 1 && periodMonth <= 12) || !(periodYear >= 2000 && periodYear <= 2100)) {
      throw new AppError('periodMonth and periodYear are required together', 400, 'BAD_REQUEST');
    }
    return { periodMonth, periodYear };
  }

  return currentIstPeriod();
}

function periodRange(periodYear, periodMonth) {
  const from = startOfUtcDay(new Date(Date.UTC(periodYear, periodMonth - 1, 1)));
  const to = endOfUtcDay(new Date(Date.UTC(periodYear, periodMonth - 1, daysInMonth(periodYear, periodMonth))));
  return { from, to };
}

function resolvePayBasis(employee) {
  const basis = employee.salary && employee.salary.payBasis;
  if (basis === 'daily' || basis === 'monthly') return basis;
  if (employee.employmentType === 'daily_wage') return 'daily';
  return 'monthly';
}

function computeBasic({ payBasis, baseAmount, workedDays, workingDays }) {
  const base = Number(baseAmount) || 0;
  const worked = Number(workedDays) || 0;
  if (payBasis === 'daily') {
    return roundMoney(base * worked);
  }
  if (!(workingDays > 0)) return 0;
  return roundMoney(base * (worked / workingDays));
}

function computeExtraShifts({ payBasis, baseAmount, overtimeHours, workingDays }) {
  const hours = Number(overtimeHours) || 0;
  if (!(hours > 0)) return 0;
  const base = Number(baseAmount) || 0;
  const dailyRate = payBasis === 'daily'
    ? base
    : (workingDays > 0 ? base / workingDays : 0);
  const hourlyRate = dailyRate / 8;
  return roundMoney(hours * hourlyRate);
}

function presentPayrollRow(row) {
  const advance = Number(row.advance) || 0;
  const advances = Array.isArray(row.advances) ? row.advances : [];
  return {
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    employeeCode: row.employeeCode || '',
    profilePhoto: row.profilePhoto || null,
    siteId: row.siteId || null,
    siteName: row.siteName || '',
    payBasis: row.payBasis,
    basicSalary: Number(row.basicSalary) || 0,
    daysPresent: row.daysPresent,
    daysInPeriod: row.daysInPeriod,
    basic: row.basic,
    extraShifts: row.extraShifts,
    advance,
    ...(advances.length ? { advances } : {}),
    netPay: row.netPay,
    isPaid: Boolean(row.isPaid),
    paidAt: row.paidAt || null,
  };
}

function summarize(items) {
  return items.reduce((acc, row) => {
    acc.gross = roundMoney(acc.gross + row.basic + row.extraShifts);
    acc.advanceRecovery = roundMoney(acc.advanceRecovery + row.advance);
    acc.netPayable = roundMoney(acc.netPayable + row.netPay);
    return acc;
  }, { gross: 0, advanceRecovery: 0, netPayable: 0 });
}

async function loadSiteByEmployee(employeeIds, siteId) {
  const filter = {
    employee: { $in: employeeIds },
    isCurrent: true,
  };
  if (siteId) filter.site = siteId;

  const rows = await Assignment.aggregate([
    { $match: filter },
    { $sort: { startDate: -1 } },
    {
      $group: {
        _id: '$employee',
        site: { $first: '$site' },
      },
    },
    {
      $lookup: {
        from: COLLECTIONS.sites,
        localField: 'site',
        foreignField: '_id',
        as: 'siteDoc',
      },
    },
    {
      $project: {
        siteId: '$site',
        siteName: { $ifNull: [{ $arrayElemAt: ['$siteDoc.name', 0] }, ''] },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), {
    siteId: row.siteId ? String(row.siteId) : null,
    siteName: row.siteName || '',
  }]));
}

async function loadAttendanceByEmployee(employeeIds, from, to) {
  if (!employeeIds.length) return new Map();
  const rows = await Attendance.aggregate([
    {
      $match: {
        employee: { $in: employeeIds },
        attendanceDate: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: '$employee',
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        halfDay: { $sum: { $cond: [{ $eq: ['$status', 'half_day'] }, 1, 0] } },
        overtimeHours: { $sum: '$overtimeHours' },
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) {
    const workedDays = roundMoney(
      (row.present || 0) + ((row.halfDay || 0) * workedDayValue('half_day'))
    );
    map.set(String(row._id), {
      workedDays,
      overtimeHours: Number(row.overtimeHours) || 0,
    });
  }
  return map;
}

async function loadAdvanceByEmployee(employeeIds, from, to) {
  if (!employeeIds.length) return new Map();
  const rows = await Advance.aggregate([
    {
      $match: {
        employee: { $in: employeeIds },
        isVoid: false,
        // Only advances taken in this payroll month.
        requestDate: { $gte: from, $lte: to },
      },
    },
    {
      $project: {
        employee: 1,
        code: 1,
        requestDate: 1,
        advanceAmount: 1,
        recoveredAmount: { $ifNull: ['$recoveredAmount', 0] },
        outstanding: {
          $subtract: ['$advanceAmount', { $ifNull: ['$recoveredAmount', 0] }],
        },
      },
    },
    { $match: { outstanding: { $gt: 0 } } },
    { $sort: { requestDate: 1 } },
    {
      $group: {
        _id: '$employee',
        outstanding: { $sum: '$outstanding' },
        items: {
          $push: {
            advanceId: '$_id',
            code: '$code',
            requestDate: '$requestDate',
            advanceAmount: '$advanceAmount',
            recoveredAmount: '$recoveredAmount',
            outstanding: '$outstanding',
          },
        },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), {
    outstanding: roundMoney(row.outstanding || 0),
    items: (row.items || []).map((item) => ({
      advanceId: String(item.advanceId),
      code: item.code || '',
      requestDate: item.requestDate || null,
      advanceAmount: roundMoney(item.advanceAmount || 0),
      recoveredAmount: roundMoney(item.recoveredAmount || 0),
      outstanding: roundMoney(item.outstanding || 0),
    })),
  }]));
}

async function loadPaidByEmployee(employeeIds, periodMonth, periodYear) {
  if (!employeeIds.length) return new Map();
  const rows = await PayrollPayment.find({
    employee: { $in: employeeIds },
    periodMonth,
    periodYear,
  }).select('employee paidAt basic extraShifts advanceRecovery netPay daysPresent daysInPeriod').lean();

  return new Map(rows.map((row) => [String(row.employee), row]));
}

async function buildSheet(query) {
  const { periodMonth, periodYear } = resolvePeriod(query);
  const workingDays = workingDaysInMonth(periodYear, periodMonth);
  const { from, to } = periodRange(periodYear, periodMonth);
  const siteId = query.siteId ? new mongoose.Types.ObjectId(String(query.siteId)) : null;

  let employeeIds = null;
  if (siteId) {
    employeeIds = await Assignment.distinct('employee', { site: siteId, isCurrent: true });
    if (!employeeIds.length) {
      return {
        periodMonth,
        periodYear,
        workingDaysInMonth: workingDays,
        summary: { gross: 0, advanceRecovery: 0, netPayable: 0 },
        items: [],
        meta: {
          page: query.page || 1,
          limit: query.limit || 20,
          total: 0,
          totalPages: 1,
        },
      };
    }
  }

  const employeeFilter = { status: 'active' };
  if (employeeIds) employeeFilter._id = { $in: employeeIds };
  if (query.employeeId) {
    employeeFilter._id = new mongoose.Types.ObjectId(String(query.employeeId));
  }

  const employees = await Employee.find(employeeFilter)
    .select('fullName code employmentType salary status profilePhoto')
    .sort({ fullName: 1 })
    .lean();

  const ids = employees.map((row) => row._id);
  const [sites, attendance, advances, paid] = await Promise.all([
    loadSiteByEmployee(ids, siteId),
    loadAttendanceByEmployee(ids, from, to),
    loadAdvanceByEmployee(ids, from, to),
    loadPaidByEmployee(ids, periodMonth, periodYear),
  ]);

  const items = employees.map((employee) => {
    const id = String(employee._id);
    const site = sites.get(id) || { siteId: null, siteName: '' };
    const att = attendance.get(id) || { workedDays: 0, overtimeHours: 0 };
    const advanceInfo = advances.get(id) || { outstanding: 0, items: [] };
    const payment = paid.get(id);
    const payBasis = resolvePayBasis(employee);
    const basicSalary = Number(employee.salary && employee.salary.baseAmount) || 0;

    const basic = payment
      ? Number(payment.basic) || 0
      : computeBasic({
        payBasis,
        baseAmount: basicSalary,
        workedDays: att.workedDays,
        workingDays,
      });
    const extraShifts = payment
      ? Number(payment.extraShifts) || 0
      : computeExtraShifts({
        payBasis,
        baseAmount: basicSalary,
        overtimeHours: att.overtimeHours,
        workingDays,
      });
    const advanceAmount = payment
      ? Number(payment.advanceRecovery) || 0
      : advanceInfo.outstanding;
    const netPay = payment
      ? Number(payment.netPay) || 0
      : roundMoney(basic + extraShifts - advanceAmount);

    return presentPayrollRow({
      employeeId: id,
      employeeName: employee.fullName,
      employeeCode: employee.code,
      profilePhoto: employee.profilePhoto || null,
      siteId: site.siteId,
      siteName: site.siteName,
      payBasis,
      basicSalary,
      daysPresent: payment ? Number(payment.daysPresent) || 0 : att.workedDays,
      daysInPeriod: payment ? Number(payment.daysInPeriod) || workingDays : workingDays,
      basic,
      extraShifts,
      advance: advanceAmount,
      advances: payment ? undefined : advanceInfo.items,
      netPay,
      isPaid: Boolean(payment),
      paidAt: payment ? payment.paidAt : null,
    });
  });

  const payBasisFilter = query.payBasis === 'monthly' || query.payBasis === 'daily'
    ? query.payBasis
    : null;
  const filtered = payBasisFilter
    ? items.filter((row) => row.payBasis === payBasisFilter)
    : items;

  const page = query.page || 1;
  const limit = query.limit || 20;
  const total = filtered.length;
  const start = (page - 1) * limit;
  const paged = filtered.slice(start, start + limit);

  return {
    periodMonth,
    periodYear,
    workingDaysInMonth: workingDays,
    payBasis: payBasisFilter,
    summary: summarize(filtered),
    items: paged,
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / limit),
    },
  };
}

async function recoverAdvancesForEmployee(employeeId, amount, user, from, to) {
  let remaining = roundMoney(amount);
  if (!(remaining > 0)) return 0;

  const filter = {
    employee: employeeId,
    isVoid: false,
  };
  if (from && to) {
    filter.requestDate = { $gte: from, $lte: to };
  }

  const advances = await Advance.find(filter).sort({ requestDate: 1 });

  let recoveredTotal = 0;
  for (const doc of advances) {
    if (!(remaining > 0)) break;
    const outstanding = roundMoney((doc.advanceAmount || 0) - (doc.recoveredAmount || 0));
    if (!(outstanding > 0)) continue;

    const take = roundMoney(Math.min(remaining, outstanding));
    doc.recoveries.push({
      amount: take,
      recoveredAt: new Date(),
      remarks: 'Payroll recovery',
      createdBy: user && user.id,
    });
    doc.recoveredAmount = roundMoney((doc.recoveredAmount || 0) + take);
    await doc.save();
    remaining = roundMoney(remaining - take);
    recoveredTotal = roundMoney(recoveredTotal + take);
  }

  return recoveredTotal;
}

async function persistEmployeeRow(row, periodMonth, periodYear, user) {
  try {
    const payment = await PayrollPayment.create({
      employee: row.employeeId,
      site: row.siteId || undefined,
      periodMonth,
      periodYear,
      payBasis: row.payBasis,
      daysPresent: row.daysPresent,
      daysInPeriod: row.daysInPeriod,
      basic: row.basic,
      extraShifts: row.extraShifts,
      advanceRecovery: row.advance,
      netPay: row.netPay,
      paidAt: new Date(),
      createdBy: user && user.id,
    });

    if (row.advance > 0) {
      const { from, to } = periodRange(periodYear, periodMonth);
      await recoverAdvancesForEmployee(row.employeeId, row.advance, user, from, to);
    }

    return payment;
  } catch (error) {
    if (error && error.code === 11000) return null;
    throw error;
  }
}

async function persistPeriod(periodMonth, periodYear, user) {
  const sheet = await buildSheet({
    periodMonth,
    periodYear,
    page: 1,
    limit: 100000,
  });

  let saved = 0;
  let skipped = 0;

  for (const row of sheet.items) {
    if (row.isPaid) {
      skipped += 1;
      continue;
    }
    const payment = await persistEmployeeRow(row, periodMonth, periodYear, user);
    if (payment) saved += 1;
    else skipped += 1;
  }

  return {
    periodMonth,
    periodYear,
    saved,
    skipped,
    total: sheet.items.length,
  };
}

async function persistPreviousIstPeriod(user) {
  const period = previousIstPeriod();
  const result = await persistPeriod(period.periodMonth, period.periodYear, user);
  logger.info({
    periodMonth: result.periodMonth,
    periodYear: result.periodYear,
    saved: result.saved,
    skipped: result.skipped,
    total: result.total,
  }, 'Payroll previous IST period auto-saved');
  return result;
}

async function list(query) {
  return buildSheet(query);
}

async function loadEmployeeAdvanceSummary(employeeId) {
  const rows = await Advance.find({
    employee: employeeId,
    isVoid: false,
  })
    .select('code requestDate advanceAmount recoveredAmount')
    .sort({ requestDate: 1 })
    .lean();

  const byMonthMap = new Map();
  let totalAdvance = 0;
  let totalRecovered = 0;
  let totalOutstanding = 0;

  for (const row of rows) {
    const amount = roundMoney(row.advanceAmount || 0);
    const recovered = roundMoney(row.recoveredAmount || 0);
    const outstanding = roundMoney(amount - recovered);
    const ist = getIstParts(row.requestDate ? new Date(row.requestDate) : new Date());
    const key = `${ist.year}-${ist.month}`;

    if (!byMonthMap.has(key)) {
      byMonthMap.set(key, {
        periodMonth: ist.month,
        periodYear: ist.year,
        advanceAmount: 0,
        recoveredAmount: 0,
        outstanding: 0,
        items: [],
      });
    }

    const bucket = byMonthMap.get(key);
    bucket.advanceAmount = roundMoney(bucket.advanceAmount + amount);
    bucket.recoveredAmount = roundMoney(bucket.recoveredAmount + recovered);
    bucket.outstanding = roundMoney(bucket.outstanding + outstanding);
    bucket.items.push({
      advanceId: String(row._id),
      code: row.code || '',
      requestDate: row.requestDate || null,
      advanceAmount: amount,
      recoveredAmount: recovered,
      outstanding,
    });

    totalAdvance = roundMoney(totalAdvance + amount);
    totalRecovered = roundMoney(totalRecovered + recovered);
    totalOutstanding = roundMoney(totalOutstanding + outstanding);
  }

  const byMonth = Array.from(byMonthMap.values()).sort((a, b) => {
    if (a.periodYear !== b.periodYear) return b.periodYear - a.periodYear;
    return b.periodMonth - a.periodMonth;
  });

  return {
    totalAdvance,
    totalRecovered,
    totalOutstanding,
    byMonth,
  };
}

async function getByEmployeeId(employeeId, query = {}) {
  const sheet = await buildSheet({
    ...query,
    employeeId,
    page: 1,
    limit: 1,
  });
  const item = sheet.items[0];
  if (!item) throw new AppError('Employee not found or inactive', 404, 'NOT_FOUND');

  const [payment, advanceSummary] = await Promise.all([
    PayrollPayment.findOne({
      employee: employeeId,
      periodMonth: sheet.periodMonth,
      periodYear: sheet.periodYear,
    }).select('_id').lean(),
    loadEmployeeAdvanceSummary(employeeId),
  ]);

  return {
    idType: 'employee',
    paymentId: payment ? String(payment._id) : null,
    periodMonth: sheet.periodMonth,
    periodYear: sheet.periodYear,
    workingDaysInMonth: sheet.workingDaysInMonth,
    payBasis: sheet.payBasis || item.payBasis,
    item,
    advanceSummary,
  };
}

async function getByPayrollId(paymentId) {
  const payment = await PayrollPayment.findById(paymentId).lean();
  if (!payment) return null;

  const employeeId = String(payment.employee);
  const [sheet, advanceSummary] = await Promise.all([
    buildSheet({
      periodMonth: payment.periodMonth,
      periodYear: payment.periodYear,
      employeeId,
      page: 1,
      limit: 1,
    }),
    loadEmployeeAdvanceSummary(employeeId),
  ]);
  const item = sheet.items[0];
  if (!item) {
    throw new AppError('Payroll payment found but employee is missing or inactive', 404, 'NOT_FOUND');
  }

  return {
    idType: 'payroll',
    paymentId: String(payment._id),
    periodMonth: payment.periodMonth,
    periodYear: payment.periodYear,
    workingDaysInMonth: sheet.workingDaysInMonth,
    payBasis: payment.payBasis || item.payBasis,
    item,
    advanceSummary,
  };
}

async function getById(id, query = {}) {
  const byPayroll = await getByPayrollId(id);
  if (byPayroll) return byPayroll;
  return getByEmployeeId(id, query);
}

async function pay(body, user) {
  const periodMonth = Number(body.periodMonth);
  const periodYear = Number(body.periodYear);
  const employeeId = String(body.employeeId);

  const existing = await PayrollPayment.findOne({
    employee: employeeId,
    periodMonth,
    periodYear,
  }).lean();
  if (existing) {
    throw new AppError('This employee is already paid for the selected period', 409, 'CONFLICT');
  }

  const sheet = await buildSheet({
    periodMonth,
    periodYear,
    employeeId,
    page: 1,
    limit: 1,
  });
  const row = sheet.items[0];
  if (!row) throw new AppError('Employee not found or inactive', 404, 'NOT_FOUND');
  if (row.isPaid) {
    throw new AppError('This employee is already paid for the selected period', 409, 'CONFLICT');
  }

  const payment = await persistEmployeeRow(row, periodMonth, periodYear, user);
  if (!payment) {
    throw new AppError('This employee is already paid for the selected period', 409, 'CONFLICT');
  }

  const refreshed = await buildSheet({
    periodMonth,
    periodYear,
    employeeId,
    page: 1,
    limit: 1,
  });

  return {
    paymentId: String(payment._id),
    periodMonth,
    periodYear,
    item: refreshed.items[0] || {
      ...row,
      isPaid: true,
      paidAt: payment.paidAt,
      advance: row.advance,
    },
  };
}

module.exports = {
  list,
  getById,
  getByEmployeeId,
  pay,
  persistPeriod,
  persistPreviousIstPeriod,
  currentIstPeriod,
  previousIstPeriod,
  getIstParts,
  workingDaysInMonth,
};
