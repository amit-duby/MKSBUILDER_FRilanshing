const { COLLECTIONS, CURRENCY } = require('../../config/constants');
const Project = require('../projects/project.model');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');
const Vehicle = require('../vehicles/vehicle.model');
const Item = require('../inventory/item.model');
const { startOfUtcDay } = require('../../common/utils/helpers');
const { summary } = require('../accounts/statement.service');
const Attendance = require('../attendance/attendance.model');

async function lowStockCount() {
  const [row] = await Item.aggregate([
    { $match: { isDeleted: false, isActive: true, reorderLevel: { $gt: 0 } } },
    {
      $lookup: {
        from: COLLECTIONS.stockBalances,
        localField: '_id',
        foreignField: 'item',
        as: 'balances',
      },
    },
    { $addFields: { onHand: { $ifNull: [{ $sum: '$balances.quantity' }, 0] } } },
    { $match: { $expr: { $lte: ['$onHand', '$reorderLevel'] } } },
    { $count: 'count' },
  ]);

  return row ? row.count : 0;
}

async function attendanceToday() {
  const date = startOfUtcDay(new Date());
  const rows = await Attendance.aggregate([
    { $match: { attendanceDate: date } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = {
    present: 0,
    absent: 0,
    half_day: 0,
    leave: 0,
    weekly_off: 0,
    holiday: 0,
  };
  let marked = 0;
  for (const row of rows) {
    counts[row._id] = row.count;
    marked += row.count;
  }
  return { date, marked, ...counts };
}

async function overview() {
  const [
    projectTotal,
    projectActive,
    siteTotal,
    siteActive,
    employeeTotal,
    employeeActive,
    vehicleAvailable,
    vehicleAssigned,
    vehicleMaintenance,
    lowStock,
    accountsThisMonth,
    attendance,
  ] = await Promise.all([
    Project.countDocuments({ isDeleted: false }),
    Project.countDocuments({ isDeleted: false, status: 'active' }),
    Site.countDocuments({ isDeleted: false }),
    Site.countDocuments({ isDeleted: false, status: 'active' }),
    Employee.countDocuments({ isDeleted: false }),
    Employee.countDocuments({ isDeleted: false, status: 'active' }),
    Vehicle.countDocuments({ isDeleted: false, status: 'available' }),
    Vehicle.countDocuments({ isDeleted: false, status: 'assigned' }),
    Vehicle.countDocuments({ isDeleted: false, status: 'maintenance' }),
    lowStockCount(),
    summary({}),
    attendanceToday(),
  ]);

  return {
    currency: CURRENCY,
    projects: { total: projectTotal, active: projectActive },
    sites: { total: siteTotal, active: siteActive },
    employees: { total: employeeTotal, active: employeeActive },
    vehicles: {
      available: vehicleAvailable,
      assigned: vehicleAssigned,
      maintenance: vehicleMaintenance,
    },
    inventory: { lowStockCount: lowStock },
    attendanceToday: attendance,
    accountsThisMonth,
  };
}

module.exports = { overview };
