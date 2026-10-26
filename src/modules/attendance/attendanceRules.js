const AppError = require('../../common/errors/AppError');

const CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const NON_WORKING = new Set(['absent', 'leave', 'weekly_off', 'holiday']);

function workedDayValue(status) {
  if (status === 'present') return 1;
  if (status === 'half_day') return 0.5;
  return 0;
}

function toClock(attendanceDate, value) {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'string' && CLOCK_PATTERN.test(value)) {
    const [hours, minutes] = value.split(':').map(Number);
    return new Date(Date.UTC(
      attendanceDate.getUTCFullYear(),
      attendanceDate.getUTCMonth(),
      attendanceDate.getUTCDate(),
      hours,
      minutes,
      0,
      0
    ));
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid check-in or check-out time', 400, 'BAD_REQUEST');
  }
  return date;
}

function resolveClockTimes(attendanceDate, checkIn, checkOut) {
  const start = toClock(attendanceDate, checkIn);
  let end = toClock(attendanceDate, checkOut);

  if (start && end && end <= start) {
    if (typeof checkOut === 'string' && CLOCK_PATTERN.test(checkOut)) {
      end = new Date(end.getTime() + (24 * 60 * 60 * 1000));
    } else {
      throw new AppError('Check-out must be after check-in', 400, 'BAD_REQUEST');
    }
  }

  return { checkIn: start, checkOut: end };
}

function assertAttendanceTimes({ status, checkIn, checkOut, overtimeHours = 0 }) {
  if (NON_WORKING.has(status) && (checkIn || checkOut || overtimeHours > 0)) {
    throw new AppError(
      'Check-in, check-out, and overtime apply only to present and half-day attendance',
      400,
      'BAD_REQUEST'
    );
  }
}

module.exports = {
  CLOCK_PATTERN,
  workedDayValue,
  resolveClockTimes,
  assertAttendanceTimes,
};
