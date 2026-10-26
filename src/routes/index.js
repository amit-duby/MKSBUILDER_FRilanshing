const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('../common/utils/asyncHandler');
const authenticate = require('../common/middleware/authenticate');
const authRoutes = require('../modules/auth/auth.routes');
const departmentRoutes = require('../modules/departments/department.routes');
const projectRoutes = require('../modules/projects/project.routes');
const siteRoutes = require('../modules/sites/site.routes');
const employeeRoutes = require('../modules/employees/employee.routes');
const attendanceRoutes = require('../modules/attendance/attendance.routes');
const inventoryRoutes = require('../modules/inventory/inventory.routes');
const vehicleRoutes = require('../modules/vehicles/vehicle.routes');
const accountRoutes = require('../modules/accounts/account.routes');
const dashboardRoutes = require('../modules/dashboard/dashboard.routes');

const router = express.Router();

router.get('/health', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    success: connected,
    message: connected ? 'OK' : 'Database unavailable',
    data: {
      service: 'mks-construction-erp',
      status: connected ? 'ok' : 'degraded',
      database: connected ? 'connected' : 'disconnected',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

router.use('/auth', authRoutes);
router.use(asyncHandler(authenticate));
router.use('/dashboard', dashboardRoutes);
router.use('/departments', departmentRoutes);
router.use('/projects', projectRoutes);
router.use('/sites', siteRoutes);
router.use('/employees', employeeRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/accounts', accountRoutes);

module.exports = router;
