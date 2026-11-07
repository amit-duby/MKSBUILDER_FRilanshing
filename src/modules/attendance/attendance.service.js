const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode, nextCodes } = require('../../common/utils/sequence');
const {
  containsRegex,
  parseSort,
  resolveRange,
  startOfBusinessDay,
  calendarDayLabel,
  endOfUtcDay,
} = require('../../common/utils/helpers');
const { workedDayValue, resolveClockTimes, assertAttendanceTimes } = require('./attendanceRules');
const Attendance = require('./attendance.model');
const Employee = require('../employees/employee.model');
const Assignment = require('../employees/assignment.model');
const Site = require('../sites/site.model');

const SORT_FIELDS = ['attendanceDate', 'status', 'createdAt', 'code'];
const POPULATE = [
  { path: 'employee', select: 'code fullName designation status department' },
  { path: 'site', select: 'name code status' },
];
const EMPTY_TOTALS = {
  present: 0,
  absent: 0,
  half_day: 0,
  leave: 0,
  weekly_off: 0,
  holiday: 0,
  marked: 0,
  workedDays: 0,
  overtimeHours: 0,
};

function present(id) {
  return Attendance.findById(id).populate(POPULATE);
}

function publicEmployee(employee) {
  if (!employee) return null;
  return {
    id: employee.id,
    code: employee.code,
    fullName: employee.fullName,
    designation: employee.designation,
    status: employee.status,
    department: employee.department,
  };
}

function publicSite(site) {
  if (!site) return null;
  return {
    id: site.id,
    name: site.name,
    code: site.code,
    status: site.status,
  };
}

function presentLoaded(doc, refs = {}) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  json.employee = publicEmployee(refs.employee);
  json.site = publicSite(refs.site);
  return json;
}

async function resolveSite(siteId) {
  if (!siteId) return null;
  return requireDoc(Site, siteId, 'Site');
}

function attendancePayload(input, employee, attendanceDate, site, user) {
  const times = resolveClockTimes(attendanceDate, input.checkIn, input.checkOut);
  const overtimeHours = input.overtimeHours || 0;
  assertAttendanceTimes({
    status: input.status,
    checkIn: times.checkIn,
    checkOut: times.checkOut,
    overtimeHours,
  });
  const nonWorking = ['absent', 'leave', 'weekly_off', 'holiday'].includes(input.status);

  return {
    employee: employee._id,
    attendanceDate,
    status: input.status,
    site: site ? site._id : null,
    checkIn: nonWorking ? null : times.checkIn,
    checkOut: nonWorking ? null : times.checkOut,
    overtimeHours: nonWorking ? 0 : overtimeHours,
    remarks: input.remarks || '',
    markedBy: user && user.id,
  };
}

function assertEmploymentWindow(employee, attendanceDate) {
  const joining = startOfBusinessDay(employee.joiningDate);
  if (attendanceDate < joining) {
    throw new AppError(
      `Attendance for ${employee.fullName} (${employee.code}) cannot be before the joining date ${calendarDayLabel(employee.joiningDate)}`,
      400,
      'BAD_REQUEST'
    );
  }
  if (employee.relievingDate) {
    const relieving = startOfBusinessDay(employee.relievingDate);
    if (attendanceDate > relieving) {
      throw new AppError(
        `Attendance for ${employee.fullName} (${employee.code}) cannot be after the relieving date ${calendarDayLabel(employee.relievingDate)}`,
        400,
        'BAD_REQUEST'
      );
    }
  }
}

async function loadMarkContext(input) {
  const attendanceDate = startOfBusinessDay(input.date);
  const [employee, site, existing] = await Promise.all([
    requireDoc(Employee, input.employeeId, 'Employee'),
    resolveSite(input.siteId),
    Attendance.findOne({
      employee: input.employeeId,
      attendanceDate,
    }),
  ]);
  assertEmploymentWindow(employee, attendanceDate);
  return { employee, site, existing, attendanceDate };
}

async function unsetLegacyProject(id) {
  await Attendance.updateOne({ _id: id }, { $unset: { project: 1 } });
}

async function savePayload(payload, refs, existing) {
  if (existing) {
    Object.assign(existing, payload);
    await existing.save();
    await unsetLegacyProject(existing._id);
    return { created: false, record: presentLoaded(existing, refs) };
  }

  try {
    const doc = await Attendance.create({
      ...payload,
      code: await nextCode('attendance', 'ATT'),
    });
    return { created: true, record: presentLoaded(doc, refs) };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const raced = await Attendance.findOne({
      employee: payload.employee,
      attendanceDate: payload.attendanceDate,
    });
    if (!raced) throw error;
    Object.assign(raced, payload);
    await raced.save();
    await unsetLegacyProject(raced._id);
    return { created: false, record: presentLoaded(raced, refs) };
  }
}

function dateFilter(query) {
  if (query.date) return startOfBusinessDay(query.date);
  if (query.from || query.to) {
    const from = query.from ? startOfBusinessDay(query.from) : new Date(0);
    const to = query.to ? endOfUtcDay(startOfBusinessDay(query.to)) : new Date();
    if (from > to) throw new AppError('from must be earlier than or equal to to', 400, 'BAD_REQUEST');
    return { $gte: from, $lte: to };
  }
  return undefined;
}

async function employeeIdsForDepartment(departmentId) {
  return Employee.find({ department: departmentId }).distinct('_id');
}

async function applyPersonFilters(filter, query) {
  if (query.departmentId) {
    const ids = await employeeIdsForDepartment(query.departmentId);
    if (query.employeeId && !ids.some((id) => String(id) === String(query.employeeId))) {
      filter.employee = { $in: [] };
      return;
    }
    filter.employee = query.employeeId ? query.employeeId : { $in: ids };
    return;
  }
  if (query.employeeId) filter.employee = query.employeeId;
}

const service = {
  async mark(body, user) {
    const { employee, site, existing, attendanceDate } = await loadMarkContext(body);
    const payload = attendancePayload(body, employee, attendanceDate, site, user);
    return savePayload(payload, { employee, site }, existing);
  },

  async bulk(body, user) {
    const seen = new Set();
    for (const entry of body.entries) {
      if (seen.has(entry.employeeId)) {
        throw new AppError('Each employee can appear only once in a daily register', 400, 'BAD_REQUEST');
      }
      seen.add(entry.employeeId);
    }

    const attendanceDate = startOfBusinessDay(body.date);
    const employeeIds = body.entries.map((entry) => entry.employeeId);
    const siteCache = new Map();
    const siteJobs = [];

    for (const entry of body.entries) {
      const siteId = entry.siteId || body.siteId;
      const key = siteId || '';
      if (!siteCache.has(key)) {
        siteCache.set(key, null);
        siteJobs.push(
          resolveSite(siteId).then((site) => {
            siteCache.set(key, site);
          })
        );
      }
    }

    const [employees, existingRows] = await Promise.all([
      Employee.find({ _id: { $in: employeeIds } }),
      Attendance.find({ employee: { $in: employeeIds }, attendanceDate }),
      Promise.all(siteJobs),
    ]);

    const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
    const existingByEmployee = new Map(existingRows.map((row) => [String(row.employee), row]));

    const prepared = body.entries.map((entry) => {
      const employee = employeeById.get(entry.employeeId);
      if (!employee) throw new AppError('Employee not found', 404, 'NOT_FOUND');
      assertEmploymentWindow(employee, attendanceDate);
      const site = siteCache.get(entry.siteId || body.siteId || '');
      return {
        employee,
        site,
        payload: attendancePayload(
          { ...entry, siteId: entry.siteId || body.siteId },
          employee,
          attendanceDate,
          site,
          user
        ),
        existing: existingByEmployee.get(entry.employeeId) || null,
      };
    });

    const insertCount = prepared.reduce((count, row) => count + (row.existing ? 0 : 1), 0);
    const codes = await nextCodes('attendance', 'ATT', insertCount);
    let codeIndex = 0;
    const ops = [];
    const records = [];
    const now = new Date();

    for (const row of prepared) {
      const refs = { employee: row.employee, site: row.site };
      if (row.existing) {
        Object.assign(row.existing, row.payload);
        ops.push({
          updateOne: {
            filter: { _id: row.existing._id },
            update: { $set: row.payload, $unset: { project: 1 } },
          },
        });
        records.push(presentLoaded(row.existing, refs));
        continue;
      }

      const doc = new Attendance({
        ...row.payload,
        code: codes[codeIndex],
        createdAt: now,
        updatedAt: now,
      });
      codeIndex += 1;
      ops.push({
        insertOne: {
          document: doc.toObject({ depopulate: true, versionKey: false }),
        },
      });
      records.push(presentLoaded(doc, refs));
    }

    if (ops.length) {
      await Attendance.bulkWrite(ops, { ordered: false, timestamps: true });
    }

    return { date: attendanceDate, count: records.length, records };
  },

  async list(query) {
    const filter = {};
    const attendanceDate = dateFilter(query);
    if (attendanceDate) filter.attendanceDate = attendanceDate;
    if (query.status) filter.status = query.status;
    if (query.siteId) filter.site = query.siteId;
    await applyPersonFilters(filter, query);
    if (query.search) filter.code = containsRegex(query.search);

    return new BaseRepository(Attendance).paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, SORT_FIELDS, { attendanceDate: -1 }),
      populate: POPULATE,
    });
  },

  async getById(id) {
    const doc = await present(id);
    if (!doc) throw new AppError('Attendance record not found', 404, 'NOT_FOUND');
    return doc;
  },

  async update(id, body, user) {
    const doc = await Attendance.findById(id);
    if (!doc) throw new AppError('Attendance record not found', 404, 'NOT_FOUND');

    const nextStatus = body.status || doc.status;
    const nonWorking = ['absent', 'leave', 'weekly_off', 'holiday'].includes(nextStatus);
    const input = {
      employeeId: String(doc.employee),
      date: body.date || doc.attendanceDate,
      status: nextStatus,
      siteId: body.siteId !== undefined ? body.siteId : doc.site,
      checkIn: body.checkIn !== undefined ? body.checkIn : (nonWorking ? null : doc.checkIn),
      checkOut: body.checkOut !== undefined ? body.checkOut : (nonWorking ? null : doc.checkOut),
      overtimeHours: body.overtimeHours !== undefined ? body.overtimeHours : (nonWorking ? 0 : doc.overtimeHours),
      remarks: body.remarks !== undefined ? body.remarks : doc.remarks,
    };
    const attendanceDate = startOfBusinessDay(input.date);
    const [employee, site] = await Promise.all([
      requireDoc(Employee, input.employeeId, 'Employee'),
      resolveSite(input.siteId || undefined),
    ]);
    assertEmploymentWindow(employee, attendanceDate);
    const payload = attendancePayload(input, employee, attendanceDate, site, user);

    if (payload.attendanceDate.getTime() !== doc.attendanceDate.getTime()) {
      const clash = await Attendance.findOne({
        employee: payload.employee,
        attendanceDate: payload.attendanceDate,
        _id: { $ne: doc._id },
      });
      if (clash) {
        throw new AppError('Attendance is already marked for this employee on this date', 409, 'CONFLICT');
      }
    }

    Object.assign(doc, payload);
    await doc.save();
    await unsetLegacyProject(doc._id);
    return presentLoaded(doc, { employee, site });
  },

  async remove(id) {
    const doc = await Attendance.findById(id);
    if (!doc) throw new AppError('Attendance record not found', 404, 'NOT_FOUND');
    await doc.deleteOne();
  },

  async register(query) {
    const attendanceDate = startOfBusinessDay(query.date);
    const filter = {};
    if (query.departmentId) filter.department = query.departmentId;
    if (query.siteId) {
      const ids = await Assignment.find({ site: query.siteId, isCurrent: true }).distinct('employee');
      filter._id = { $in: ids };
    }
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$or = [{ fullName: pattern }, { code: pattern }, { designation: pattern }];
    }

    const result = await new BaseRepository(Employee).paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, ['fullName', 'code', 'createdAt'], { fullName: 1 }),
      populate: [{ path: 'department', select: 'name code' }],
    });

    const marks = await Attendance.find({
      attendanceDate,
      employee: { $in: result.items.map((employee) => employee._id) },
    }).populate([{ path: 'site', select: 'name code status' }]);

    const byEmployee = new Map(marks.map((mark) => {
      const employeeId = mark.employee && mark.employee._id
        ? String(mark.employee._id)
        : String(mark.employee);
      return [employeeId, mark];
    }));

    return {
      date: attendanceDate,
      items: result.items.map((employee) => ({
        employee,
        attendance: byEmployee.get(String(employee.id)) || null,
      })),
      meta: result.meta,
    };
  },

  async summary(query) {
    const range = resolveRange(query, 1);
    const match = {
      attendanceDate: { $gte: range.from, $lte: range.to },
    };
    if (query.siteId) match.site = new mongoose.Types.ObjectId(query.siteId);

    if (query.departmentId) {
      const ids = await employeeIdsForDepartment(query.departmentId);
      if (query.employeeId && !ids.some((id) => String(id) === String(query.employeeId))) {
        match.employee = { $in: [] };
      } else {
        match.employee = query.employeeId
          ? new mongoose.Types.ObjectId(query.employeeId)
          : { $in: ids };
      }
    } else if (query.employeeId) {
      match.employee = new mongoose.Types.ObjectId(query.employeeId);
    }

    const skip = (query.page - 1) * query.limit;
    const [statusRows, employeePage] = await Promise.all([
      Attendance.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$status',
            days: { $sum: 1 },
            overtimeHours: { $sum: '$overtimeHours' },
          },
        },
      ]),
      Attendance.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$employee',
            present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
            halfDay: { $sum: { $cond: [{ $eq: ['$status', 'half_day'] }, 1, 0] } },
            leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
            weeklyOff: { $sum: { $cond: [{ $eq: ['$status', 'weekly_off'] }, 1, 0] } },
            holiday: { $sum: { $cond: [{ $eq: ['$status', 'holiday'] }, 1, 0] } },
            overtimeHours: { $sum: '$overtimeHours' },
          },
        },
        {
          $addFields: {
            workedDays: { $add: ['$present', { $multiply: ['$halfDay', 0.5] }] },
          },
        },
        { $sort: { workedDays: -1, _id: 1 } },
        {
          $facet: {
            items: [
              { $skip: skip },
              { $limit: query.limit },
              {
                $lookup: {
                  from: COLLECTIONS.employees,
                  localField: '_id',
                  foreignField: '_id',
                  as: 'employee',
                },
              },
              { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  _id: 0,
                  employee: {
                    id: { $toString: '$_id' },
                    code: '$employee.code',
                    fullName: '$employee.fullName',
                  },
                  present: 1,
                  absent: 1,
                  halfDay: 1,
                  leave: 1,
                  weeklyOff: 1,
                  holiday: 1,
                  workedDays: 1,
                  overtimeHours: 1,
                },
              },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ]),
    ]);

    const totals = { ...EMPTY_TOTALS };
    for (const row of statusRows) {
      totals[row._id] = row.days;
      totals.marked += row.days;
      totals.overtimeHours += row.overtimeHours;
      totals.workedDays += row.days * workedDayValue(row._id);
    }

    const page = employeePage[0] || { items: [], total: [] };
    const total = page.total[0] ? page.total[0].count : 0;

    return {
      range,
      totals,
      employees: page.items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 1 : Math.ceil(total / query.limit),
      },
    };
  },
};

module.exports = service;
