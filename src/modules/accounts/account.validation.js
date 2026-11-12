const {
  PAYMENT_MODE_NOTES,
  PAY_BASIS,
} = require('../../config/constants');
const {
  z,
  objectId,
  requestSchema,
  idParams,
  listQuery,
  shortText,
  optionalText,
  dateValue,
} = require('../../common/validators/zod');

const includeVoid = {
  includeVoid: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
};

const voidBody = z.object({
  reason: z.string().trim().min(5).max(300),
});

const coercedMoney = z.coerce
  .number()
  .finite()
  .min(0)
  .max(999999999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Use at most 2 decimal places',
  });

const advanceBody = z.object({
  employeeId: objectId,
  monthlySalary: coercedMoney.optional(),
  requestDate: dateValue.optional(),
  advanceAmount: coercedMoney.refine((value) => value > 0, {
    message: 'Advance amount must be greater than zero',
  }),
  reasonForAdvance: shortText(500),
  attachment: z.string().trim().min(1).nullable().optional(),
  employeeRemarks: optionalText(500),
});

const advanceUpdate = advanceBody.partial();

const rangeQuery = {
  from: dateValue.optional(),
  to: dateValue.optional(),
  projectId: objectId.optional(),
};

module.exports = {
  byId: requestSchema({ params: idParams }),
  summary: requestSchema({ query: z.object(rangeQuery) }),
  statement: requestSchema({
    params: z.object({ employeeId: objectId }),
    query: z.object({
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  listAdvances: requestSchema({
    query: listQuery({
      ...includeVoid,
      employeeId: objectId.optional(),
      departmentId: objectId.optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  createAdvance: requestSchema({ body: advanceBody }),
  updateAdvance: requestSchema({ params: idParams, body: advanceUpdate }),
  recoverAdvance: requestSchema({
    params: idParams,
    body: z.object({
      amount: coercedMoney.refine((value) => value > 0, {
        message: 'Recovered amount must be greater than zero',
      }),
      recoveredAt: dateValue.optional(),
      remarks: optionalText(300),
    }),
  }),
  voidAdvance: requestSchema({ params: idParams, body: voidBody }),
  listPayroll: requestSchema({
    query: listQuery({
      periodMonth: z.coerce.number().int().min(1).max(12).optional(),
      periodYear: z.coerce.number().int().min(2000).max(2100).optional(),
      siteId: objectId.optional(),
      employeeId: objectId.optional(),
      payBasis: z.enum(PAY_BASIS).optional(),
    }),
  }),
  getPayrollById: requestSchema({
    params: idParams,
    query: z.object({
      periodMonth: z.coerce.number().int().min(1).max(12).optional(),
      periodYear: z.coerce.number().int().min(2000).max(2100).optional(),
      payBasis: z.enum(PAY_BASIS).optional(),
    }),
  }),
  payPayroll: requestSchema({
    body: z.object({
      periodMonth: z.number().int().min(1).max(12),
      periodYear: z.number().int().min(2000).max(2100),
      employeeId: objectId,
    }),
  }),
};
