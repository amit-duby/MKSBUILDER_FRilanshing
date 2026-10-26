const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  workedDayValue,
  resolveClockTimes,
  assertAttendanceTimes,
} = require('../src/modules/attendance/attendanceRules');

const day = new Date(Date.UTC(2026, 3, 1));

describe('attendance day value', () => {
  it('counts a full day, a half day, and no worked day', () => {
    assert.equal(workedDayValue('present'), 1);
    assert.equal(workedDayValue('half_day'), 0.5);
    assert.equal(workedDayValue('absent'), 0);
    assert.equal(workedDayValue('leave'), 0);
  });
});

describe('attendance clock times', () => {
  it('keeps a same-day shift on the attendance date', () => {
    const times = resolveClockTimes(day, '09:00', '18:00');
    assert.equal(times.checkIn.toISOString(), '2026-04-01T09:00:00.000Z');
    assert.equal(times.checkOut.toISOString(), '2026-04-01T18:00:00.000Z');
  });

  it('rolls a night shift check-out to the next day', () => {
    const times = resolveClockTimes(day, '22:00', '06:00');
    assert.equal(times.checkOut.toISOString(), '2026-04-02T06:00:00.000Z');
  });

  it('rejects a full timestamp that ends before it starts', () => {
    assert.throws(
      () => resolveClockTimes(
        day,
        new Date('2026-04-01T18:00:00.000Z'),
        new Date('2026-04-01T09:00:00.000Z')
      ),
      (error) => error.code === 'BAD_REQUEST'
    );
  });
});

describe('attendance status rules', () => {
  it('rejects overtime on an absence', () => {
    assert.throws(
      () => assertAttendanceTimes({ status: 'absent', checkIn: new Date(), overtimeHours: 1 }),
      (error) => error.code === 'BAD_REQUEST'
    );
  });

  it('allows a half day with a check-in', () => {
    assert.doesNotThrow(() => assertAttendanceTimes({
      status: 'half_day',
      checkIn: new Date(),
      checkOut: null,
      overtimeHours: 0,
    }));
  });
});
