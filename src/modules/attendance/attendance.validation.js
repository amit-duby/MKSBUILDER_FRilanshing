const { ATTENDANCE_STATUS } = require('../../config/constants');
const {
  z,
  objectId,
  requestSchema,
  idParams,
  listQuery,
  optionalText,
  dateValue,
} = require('../../common/validators/zod');

const overtimeHours = z
  .number()
  .finite()
  .min(0)
  .max(16)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Use at most 2 decimal places',
  });

const clock = z.union([
  z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm'),
  z.coerce.date(),
]);

const markBody = z.object({
  employeeId: objectId,
  date: dateValue,
  status: z.enum(ATTENDANCE_STATUS),
  projectId: objectId.optional(),
  siteId: objectId.optional(),
  checkIn: clock.nullable().optional(),
  checkOut: clock.nullable().optional(),
  overtimeHours: overtimeHours.optional(),
  remarks: optionalText(300),
});

const updateBody = z.object({
  date: dateValue.optional(),
  status: z.enum(ATTENDANCE_STATUS).optional(),
  projectId: objectId.nullable().optional(),
  siteId: objectId.nullable().optional(),
  checkIn: clock.nullable().optional(),
  checkOut: clock.nullable().optional(),
  overtimeHours: overtimeHours.optional(),
  remarks: optionalText(300),
});

const entryBody = z.object({
  employeeId: objectId,
  status: z.enum(ATTENDANCE_STATUS),
  siteId: objectId.optional(),
  checkIn: clock.nullable().optional(),
  checkOut: clock.nullable().optional(),
  overtimeHours: overtimeHours.optional(),
  remarks: optionalText(300),
});

const bulkBody = z.object({
  date: dateValue,
  projectId: objectId.optional(),
  siteId: objectId.optional(),
  entries: z.array(entryBody).min(1).max(200),
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      date: dateValue.optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
      employeeId: objectId.optional(),
      departmentId: objectId.optional(),
      siteId: objectId.optional(),
      projectId: objectId.optional(),
      status: z.enum(ATTENDANCE_STATUS).optional(),
    }),
  }),
  mark: requestSchema({ body: markBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
  bulk: requestSchema({ body: bulkBody }),
  register: requestSchema({
    query: listQuery({
      date: dateValue,
      departmentId: objectId.optional(),
      siteId: objectId.optional(),
    }),
  }),
  summary: requestSchema({
    query: z.object({
      from: dateValue.optional(),
      to: dateValue.optional(),
      employeeId: objectId.optional(),
      departmentId: objectId.optional(),
      siteId: objectId.optional(),
      projectId: objectId.optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
};
