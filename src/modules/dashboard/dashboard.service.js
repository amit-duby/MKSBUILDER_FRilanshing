const { COLLECTIONS, CURRENCY } = require('../../config/constants');
const { roundMoney } = require('../../common/utils/money');
const {
  startOfBusinessDay,
  endOfUtcDay,
  addDays,
} = require('../../common/utils/helpers');
const Project = require('../projects/project.model');
const ProjectDetail = require('../projectDetails/projectDetail.model');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');
const Vehicle = require('../vehicles/vehicle.model');
const Maintenance = require('../vehicles/maintenance.model');
const Item = require('../inventory/item.model');
const Movement = require('../inventory/movement.model');
const Attendance = require('../attendance/attendance.model');
const Expense = require('../accounts/expense.model');
const Advance = require('../accounts/advance.model');
const PayrollPayment = require('../accounts/payroll.model');
const ImpressAmount = require('../ImpressAmount/impressAmount.model');
const LocalAmount = require('../localAmount/localAmount.model');

function currentIstParts(date = new Date()) {
  const day = startOfBusinessDay(date);
  return {
    year: day.getUTCFullYear(),
    month: day.getUTCMonth() + 1,
    day: day.getUTCDate(),
    date: day,
  };
}

function monthRange(year, month) {
  const from = startOfBusinessDay(new Date(Date.UTC(year, month - 1, 1)));
  const last = startOfBusinessDay(new Date(Date.UTC(year, month, 0)));
  return { from, to: endOfUtcDay(last) };
}

function lastNMonthKeys(n, fromDate = new Date()) {
  const { year, month } = currentIstParts(fromDate);
  const keys = [];
  let y = year;
  let m = month;
  for (let i = 0; i < n; i += 1) {
    keys.push({ periodYear: y, periodMonth: m });
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return keys.reverse();
}

function emptyMonthSeries(keys, fields) {
  return keys.map((key) => {
    const row = { ...key };
    for (const field of fields) row[field] = 0;
    return row;
  });
}

function fillMonthSeries(keys, rows, fields, getKey = (row) => `${row._id.year}-${row._id.month}`) {
  const map = new Map(rows.map((row) => [getKey(row), row]));
  return keys.map((key) => {
    const hit = map.get(`${key.periodYear}-${key.periodMonth}`);
    const out = { ...key };
    for (const field of fields) {
      out[field] = hit ? roundMoney(hit[field] || 0) : 0;
    }
    return out;
  });
}

async function kpis() {
  const now = currentIstParts();
  const { from: monthFrom, to: monthTo } = monthRange(now.year, now.month);
  const today = now.date;

  const [
    activeEmployees,
    presentToday,
    payrollPaidThisMonth,
    advanceOutstanding,
    projectsTotal,
    workingSites,
    vehiclesTotal,
    companyProjects,
    storeMaterials,
    stockValueRow,
  ] = await Promise.all([
    Employee.countDocuments({ status: 'active' }),
    Attendance.countDocuments({ attendanceDate: today, status: { $in: ['present', 'half_day'] } }),
    PayrollPayment.aggregate([
      { $match: { periodMonth: now.month, periodYear: now.year } },
      { $group: { _id: null, total: { $sum: '$netPay' }, count: { $sum: 1 } } },
    ]),
    Advance.aggregate([
      { $match: { isVoid: false } },
      {
        $project: {
          outstanding: {
            $subtract: ['$advanceAmount', { $ifNull: ['$recoveredAmount', 0] }],
          },
        },
      },
      { $match: { outstanding: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$outstanding' } } },
    ]),
    Project.countDocuments({}),
    Site.countDocuments({ status: 'active' }),
    Vehicle.countDocuments({}),
    ProjectDetail.countDocuments({}),
    Item.countDocuments({ isActive: true }),
    Item.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: COLLECTIONS.stockBalances,
          localField: '_id',
          foreignField: 'item',
          as: 'balances',
        },
      },
      {
        $lookup: {
          from: COLLECTIONS.stockMovements,
          let: { itemId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$item', '$$itemId'] },
                    { $eq: ['$type', 'receipt'] },
                    { $gt: ['$unitCost', 0] },
                  ],
                },
              },
            },
            { $sort: { movementDate: -1 } },
            { $limit: 1 },
            { $project: { unitCost: 1 } },
          ],
          as: 'lastReceipt',
        },
      },
      {
        $project: {
          onHand: { $ifNull: [{ $sum: '$balances.quantity' }, 0] },
          unitCost: { $ifNull: [{ $arrayElemAt: ['$lastReceipt.unitCost', 0] }, 0] },
        },
      },
      {
        $group: {
          _id: null,
          totalStockValue: {
            $sum: { $multiply: ['$onHand', '$unitCost'] },
          },
        },
      },
    ]),
  ]);

  return {
    totalActiveEmployees: activeEmployees,
    totalPresent: presentToday,
    totalStaffSalaryPaidThisMonth: roundMoney((payrollPaidThisMonth[0] && payrollPaidThisMonth[0].total) || 0),
    totalStaffPaidCountThisMonth: (payrollPaidThisMonth[0] && payrollPaidThisMonth[0].count) || 0,
    totalOutstandingAdvances: roundMoney((advanceOutstanding[0] && advanceOutstanding[0].total) || 0),
    totalProjects: projectsTotal,
    totalWorkingSites: workingSites,
    totalVehicles: vehiclesTotal,
    totalCompanyProjects: companyProjects,
    totalStoreMaterials: storeMaterials,
    totalStockValues: roundMoney((stockValueRow[0] && stockValueRow[0].totalStockValue) || 0),
    period: { periodMonth: now.month, periodYear: now.year, from: monthFrom, to: monthTo },
  };
}

async function impressOutstanding() {
  const [totals] = await ImpressAmount.aggregate([
    {
      $lookup: {
        from: COLLECTIONS.localAmounts,
        localField: '_id',
        foreignField: 'impressAmount',
        as: 'locals',
      },
    },
    {
      $project: {
        settled: { $gt: [{ $size: '$locals' }, 0] },
        localSpend: { $sum: '$locals.returnAmount' },
      },
    },
    {
      $group: {
        _id: null,
        totalImpress: { $sum: 1 },
        outstandingCount: {
          $sum: { $cond: [{ $eq: ['$settled', false] }, 1, 0] },
        },
        settledCount: {
          $sum: { $cond: [{ $eq: ['$settled', true] }, 1, 0] },
        },
        totalLocalSpend: { $sum: '$localSpend' },
      },
    },
  ]);

  return {
    totalImpress: (totals && totals.totalImpress) || 0,
    outstandingCount: (totals && totals.outstandingCount) || 0,
    settledCount: (totals && totals.settledCount) || 0,
    totalLocalSpend: roundMoney((totals && totals.totalLocalSpend) || 0),
  };
}

async function spendThisMonth() {
  const now = currentIstParts();
  const { from, to } = monthRange(now.year, now.month);

  const [salaryPaid, advanceGiven, vehicleSpend, localBills, storePurchases, expensesByCategory] = await Promise.all([
    PayrollPayment.aggregate([
      {
        $match: {
          periodMonth: now.month,
          periodYear: now.year,
        },
      },
      { $group: { _id: null, total: { $sum: '$netPay' } } },
    ]),
    Advance.aggregate([
      {
        $match: {
          isVoid: false,
          requestDate: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: null, total: { $sum: '$advanceAmount' } } },
    ]),
    Expense.aggregate([
      {
        $match: {
          isVoid: false,
          category: 'vehicle',
          expenseDate: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    LocalAmount.aggregate([
      { $match: { date: { $gte: from, $lte: to } } },
      { $group: { _id: null, total: { $sum: '$returnAmount' } } },
    ]),
    Movement.aggregate([
      {
        $match: {
          type: 'receipt',
          movementDate: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$totalAmount', 0] } } } },
    ]),
    Expense.aggregate([
      {
        $match: {
          isVoid: false,
          expenseDate: { $gte: from, $lte: to },
        },
      },
      { $group: { _id: '$category', total: { $sum: '$amount' } } },
    ]),
  ]);

  const maintenanceSpend = await Maintenance.aggregate([
    { $match: { date: { $gte: from, $lte: to } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const salary = roundMoney((salaryPaid[0] && salaryPaid[0].total) || 0);
  const advances = roundMoney((advanceGiven[0] && advanceGiven[0].total) || 0);
  const vehicles = roundMoney(
    ((vehicleSpend[0] && vehicleSpend[0].total) || 0)
    + ((maintenanceSpend[0] && maintenanceSpend[0].total) || 0)
  );
  const local = roundMoney((localBills[0] && localBills[0].total) || 0);
  const store = roundMoney((storePurchases[0] && storePurchases[0].total) || 0);
  const byCategory = {};
  for (const row of expensesByCategory) {
    byCategory[row._id] = roundMoney(row.total || 0);
  }

  return {
    periodMonth: now.month,
    periodYear: now.year,
    salary,
    advances,
    vehicles,
    localBills: local,
    imprest: local,
    storePurchases: store,
    byExpenseCategory: byCategory,
    total: roundMoney(salary + advances + vehicles + local + store),
  };
}

async function payLast6Months() {
  const keys = lastNMonthKeys(6);
  const first = keys[0];
  const last = keys[keys.length - 1];
  const from = monthRange(first.periodYear, first.periodMonth).from;
  const to = monthRange(last.periodYear, last.periodMonth).to;

  const payrollRows = await PayrollPayment.aggregate([
    {
      $match: {
        $expr: {
          $and: [
            {
              $gte: [
                { $dateFromParts: { year: '$periodYear', month: '$periodMonth', day: 1 } },
                from,
              ],
            },
            {
              $lte: [
                { $dateFromParts: { year: '$periodYear', month: '$periodMonth', day: 1 } },
                to,
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: { year: '$periodYear', month: '$periodMonth' },
        netPay: { $sum: '$netPay' },
        count: { $sum: 1 },
      },
    },
  ]);

  return fillMonthSeries(keys, payrollRows, ['netPay', 'count']).map((row) => ({
    periodMonth: row.periodMonth,
    periodYear: row.periodYear,
    payrollPaid: row.netPay,
    payrollCount: row.count,
  }));
}

async function attendanceLast14Days() {
  const end = currentIstParts().date;
  const start = startOfBusinessDay(addDays(end, -13));
  const rows = await Attendance.aggregate([
    { $match: { attendanceDate: { $gte: start, $lte: endOfUtcDay(end) } } },
    {
      $group: {
        _id: '$attendanceDate',
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        halfDay: { $sum: { $cond: [{ $eq: ['$status', 'half_day'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
        marked: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDate = new Map(rows.map((row) => [startOfBusinessDay(row._id).toISOString(), row]));
  const days = [];
  for (let i = 0; i < 14; i += 1) {
    const date = startOfBusinessDay(addDays(start, i));
    const hit = byDate.get(date.toISOString());
    days.push({
      date,
      present: (hit && hit.present) || 0,
      halfDay: (hit && hit.halfDay) || 0,
      absent: (hit && hit.absent) || 0,
      leave: (hit && hit.leave) || 0,
      marked: (hit && hit.marked) || 0,
      workedHeadcount: roundMoney(((hit && hit.present) || 0) + (((hit && hit.halfDay) || 0) * 0.5)),
    });
  }
  return days;
}

async function projectStatus() {
  const rows = await ProjectDetail.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = {
    planning: 0,
    active: 0,
    on_hold: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row._id)) {
      counts[row._id] = row.count;
    }
  }
  const legacyActive = await Project.countDocuments({ status: true });
  const legacyInactive = await Project.countDocuments({ status: false });
  return {
    ...counts,
    companyProjectsActiveFlag: legacyActive,
    companyProjectsInactiveFlag: legacyInactive,
  };
}

async function fleetStatus() {
  const [statusRows, underRepair] = await Promise.all([
    Vehicle.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Maintenance.distinct('vehicle', {
      date: { $gte: addDays(new Date(), -30) },
    }),
  ]);

  const counts = { available: 0, assigned: 0, inactive: 0 };
  for (const row of statusRows) {
    if (Object.prototype.hasOwnProperty.call(counts, row._id)) {
      counts[row._id] = row.count;
    }
  }

  return {
    assigned: counts.assigned,
    available: counts.available,
    idle: counts.available,
    inactive: counts.inactive,
    underRepair: underRepair.length,
    total: counts.available + counts.assigned + counts.inactive,
  };
}

async function storeMovementLast6Months() {
  const keys = lastNMonthKeys(6);
  const first = keys[0];
  const last = keys[keys.length - 1];
  const from = monthRange(first.periodYear, first.periodMonth).from;
  const to = monthRange(last.periodYear, last.periodMonth).to;

  const rows = await Movement.aggregate([
    {
      $match: {
        type: { $in: ['receipt', 'issue'] },
        movementDate: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$movementDate' },
          month: { $month: '$movementDate' },
          type: '$type',
        },
        quantity: { $sum: '$quantity' },
        amount: { $sum: { $ifNull: ['$totalAmount', 0] } },
      },
    },
  ]);

  const series = emptyMonthSeries(keys, ['inwardQty', 'issueQty', 'inwardAmount', 'issueAmount']);
  for (const row of rows) {
    const key = `${row._id.year}-${row._id.month}`;
    const target = series.find((item) => `${item.periodYear}-${item.periodMonth}` === key);
    if (!target) continue;
    if (row._id.type === 'receipt') {
      target.inwardQty = roundMoney(row.quantity || 0);
      target.inwardAmount = roundMoney(row.amount || 0);
    } else if (row._id.type === 'issue') {
      target.issueQty = roundMoney(row.quantity || 0);
      target.issueAmount = roundMoney(row.amount || 0);
    }
  }
  return series;
}

async function stockByCategory() {
  const rows = await Item.aggregate([
    { $match: { isActive: true } },
    {
      $lookup: {
        from: COLLECTIONS.stockBalances,
        localField: '_id',
        foreignField: 'item',
        as: 'balances',
      },
    },
    {
      $project: {
        category: 1,
        onHand: { $ifNull: [{ $sum: '$balances.quantity' }, 0] },
      },
    },
    {
      $group: {
        _id: '$category',
        quantityOnHand: { $sum: '$onHand' },
        itemCount: { $sum: 1 },
      },
    },
    { $sort: { quantityOnHand: -1 } },
  ]);

  return rows.map((row) => ({
    category: row._id || 'Uncategorized',
    quantityOnHand: roundMoney(row.quantityOnHand || 0),
    itemCount: row.itemCount || 0,
  }));
}

async function lowStockAlerts(limit = 20) {
  const rows = await Item.aggregate([
    { $match: { isActive: true, reorderLevel: { $gt: 0 } } },
    {
      $lookup: {
        from: COLLECTIONS.stockBalances,
        localField: '_id',
        foreignField: 'item',
        as: 'balances',
      },
    },
    {
      $addFields: {
        onHand: { $ifNull: [{ $sum: '$balances.quantity' }, 0] },
      },
    },
    { $match: { $expr: { $lte: ['$onHand', '$reorderLevel'] } } },
    { $sort: { onHand: 1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        itemId: { $toString: '$_id' },
        code: 1,
        sku: 1,
        name: 1,
        category: 1,
        unit: 1,
        reorderLevel: 1,
        onHand: 1,
      },
    },
  ]);

  return rows.map((row) => ({
    ...row,
    onHand: roundMoney(row.onHand || 0),
    shortage: roundMoney(Math.max((row.reorderLevel || 0) - (row.onHand || 0), 0)),
  }));
}

async function recentPayments(limit = 15) {
  const [expenses, payroll, localBills] = await Promise.all([
    Expense.find({ isVoid: false })
      .sort({ expenseDate: -1 })
      .limit(limit)
      .select('code category amount expenseDate payeeName paymentModeNote')
      .lean(),
    PayrollPayment.find({})
      .sort({ paidAt: -1 })
      .limit(limit)
      .populate({ path: 'employee', select: 'fullName code profilePhoto' })
      .select('netPay periodMonth periodYear employee paidAt')
      .lean(),
    LocalAmount.find({})
      .sort({ date: -1 })
      .limit(limit)
      .select('code returnAmount date paymentMode details')
      .lean(),
  ]);

  const rows = [];

  for (const row of expenses) {
    rows.push({
      type: 'expense',
      id: String(row._id),
      code: row.code,
      label: row.payeeName,
      category: row.category,
      amount: roundMoney(row.amount || 0),
      date: row.expenseDate,
      mode: row.paymentModeNote || null,
    });
  }
  for (const row of payroll) {
    rows.push({
      type: 'payroll',
      id: String(row._id),
      code: null,
      label: row.employee ? row.employee.fullName : 'Payroll',
      category: 'payroll',
      amount: roundMoney(row.netPay || 0),
      date: row.paidAt,
      periodMonth: row.periodMonth,
      periodYear: row.periodYear,
      employee: row.employee
        ? {
          id: String(row.employee._id || row.employee.id),
          fullName: row.employee.fullName,
          code: row.employee.code,
          profilePhoto: row.employee.profilePhoto || null,
        }
        : null,
    });
  }
  for (const row of localBills) {
    rows.push({
      type: 'local_bill',
      id: String(row._id),
      code: row.code,
      label: row.details,
      category: 'imprest',
      amount: roundMoney(row.returnAmount || 0),
      date: row.date,
      mode: row.paymentMode || null,
    });
  }

  return rows
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

async function headcountByDepartment() {
  const rows = await Employee.aggregate([
    { $match: { status: 'active' } },
    {
      $group: {
        _id: '$department',
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: COLLECTIONS.departments,
        localField: '_id',
        foreignField: '_id',
        as: 'department',
      },
    },
    {
      $project: {
        _id: 0,
        departmentId: { $toString: '$_id' },
        name: { $ifNull: [{ $arrayElemAt: ['$department.name', 0] }, 'Unknown'] },
        code: { $ifNull: [{ $arrayElemAt: ['$department.code', 0] }, ''] },
        count: 1,
      },
    },
    { $sort: { count: -1, name: 1 } },
  ]);

  return rows;
}

async function totalVehicleSpend() {
  const [expense, maintenance] = await Promise.all([
    Expense.aggregate([
      { $match: { isVoid: false, category: 'vehicle' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Maintenance.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);
  return roundMoney(
    ((expense[0] && expense[0].total) || 0)
    + ((maintenance[0] && maintenance[0].total) || 0)
  );
}

async function overview() {
  const [
    summaryKpis,
    impress,
    vehicleSpendTotal,
    payLast6,
    attendance14,
    spendMonth,
    projects,
    fleet,
    storeMovement,
    stockCategory,
    lowStock,
    payments,
    headcount,
  ] = await Promise.all([
    kpis(),
    impressOutstanding(),
    totalVehicleSpend(),
    payLast6Months(),
    attendanceLast14Days(),
    spendThisMonth(),
    projectStatus(),
    fleetStatus(),
    storeMovementLast6Months(),
    stockByCategory(),
    lowStockAlerts(),
    recentPayments(),
    headcountByDepartment(),
  ]);

  return {
    currency: CURRENCY,
    kpis: {
      ...summaryKpis,
      impressOutstanding: impress.outstandingCount,
      impressLocalSpend: impress.totalLocalSpend,
      totalVehicleSpend: vehicleSpendTotal,
    },
    impress,
    payLast6Months: payLast6,
    attendanceLast14Days: attendance14,
    spendThisMonth: spendMonth,
    projectStatus: projects,
    fleetStatus: fleet,
    storeMovementLast6Months: storeMovement,
    stockByCategory: stockCategory,
    lowStockAlerts: lowStock,
    recentPayments: payments,
    headcountByDepartment: headcount,
  };
}

module.exports = { overview };
