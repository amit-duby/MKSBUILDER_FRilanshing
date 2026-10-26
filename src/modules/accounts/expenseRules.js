const AppError = require('../../common/errors/AppError');
const { EMPLOYEE_EXPENSE_CATEGORIES } = require('../../config/constants');

function assertExpenseShape(body) {
  if (EMPLOYEE_EXPENSE_CATEGORIES.includes(body.category) && !body.employeeId) {
    throw new AppError('Employee is required for this expense category', 400, 'BAD_REQUEST');
  }
  if (body.category === 'vehicle' && !body.vehicleId) {
    throw new AppError('Vehicle is required for a vehicle expense', 400, 'BAD_REQUEST');
  }
  if (body.category === 'site' && !body.siteId) {
    throw new AppError('Site is required for a site expense', 400, 'BAD_REQUEST');
  }
  if (body.category === 'contractor' && !body.payeeName) {
    throw new AppError('Payee name is required for a contractor expense', 400, 'BAD_REQUEST');
  }
}

module.exports = { assertExpenseShape };
