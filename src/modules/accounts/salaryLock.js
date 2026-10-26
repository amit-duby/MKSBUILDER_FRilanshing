const AppError = require('../../common/errors/AppError');

const OPEN_FIELDS = new Set(['amountPaid', 'remarks', 'recordStatus']);

function assertSalaryPatchAllowed(recordStatus, body) {
  if (recordStatus !== 'recorded') return;

  const blocked = Object.keys(body).filter(
    (key) => body[key] !== undefined && !OPEN_FIELDS.has(key)
  );

  if (blocked.length) {
    throw new AppError(
      'A recorded salary sheet only accepts the amount paid, remarks, or a status change back to draft',
      400,
      'SALARY_LOCKED',
      blocked.map((field) => ({
        field,
        message: 'Locked while the sheet is recorded',
      }))
    );
  }
}

module.exports = { assertSalaryPatchAllowed };
