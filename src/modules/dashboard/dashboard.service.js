const { CURRENCY } = require('../../config/constants');
const Project = require('../projects/project.model');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');
const Vehicle = require('../vehicles/vehicle.model');
const { startOfUtcDay } = require('../../common/utils/helpers');
const { summary } = require('../accounts/statement.service');
const Attendance = require('../attendance/attendance.model');

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
    vehicleMaintenance,
    accountsThisMonth,
    attendance,
  ] = await Promise.all([
    Project.countDocuments({}),
    Project.countDocuments({ status: 'active' }),
    Site.countDocuments({}),
    Site.countDocuments({ status: 'active' }),
    Employee.countDocuments({}),
    Employee.countDocuments({ status: 'active' }),
    Vehicle.countDocuments({ status: 'available' }),
    Vehicle.countDocuments({ status: 'maintenance' }),
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
      maintenance: vehicleMaintenance,
    },
    attendanceToday: attendance,
    accountsThisMonth,
  };
}

module.exports = { overview };
