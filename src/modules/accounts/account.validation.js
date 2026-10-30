const {
  EXPENSE_CATEGORIES,
  PAYMENT_MODE_NOTES,
  PAY_BASIS,
  SALARY_RECORD_STATUS,
} = require('../../config/constants');
const {
  z,
  objectId,
  money,
  requestSchema,
  idParams,
  listQuery,
  shortText,
  optionalText,
  dateValue,
  amountLine,
} = require('../../common/validators/zod');

const positiveMoney = money.refine((value) => value > 0, {
  message: 'Amount must be greater than zero',
});

const includeVoid = {
  includeVoid: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
};

const salaryBody = z.object({
  employeeId: objectId,
  projectId: objectId.optional(),
  siteId: objectId.optional(),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(2100),
  payBasis: z.enum(PAY_BASIS).optional(),
  baseAmount: money.optional(),
  allowances: z.array(amountLine).max(20).optional(),
  deductions: z.array(amountLine).max(20).optional(),
  extras: z.array(amountLine).max(20).optional(),
  amountPaid: money.optional(),
  recordStatus: z.enum(SALARY_RECORD_STATUS).optional(),
  remarks: optionalText(500),
});

const salaryUpdate = z.object({
  projectId: objectId.nullable().optional(),
  siteId: objectId.nullable().optional(),
  periodMonth: z.number().int().min(1).max(12).optional(),
  periodYear: z.number().int().min(2000).max(2100).optional(),
  payBasis: z.enum(PAY_BASIS).optional(),
  baseAmount: money.optional(),
  allowances: z.array(amountLine).max(20).optional(),
  deductions: z.array(amountLine).max(20).optional(),
  extras: z.array(amountLine).max(20).optional(),
  amountPaid: money.optional(),
  recordStatus: z.enum(SALARY_RECORD_STATUS).optional(),
  remarks: optionalText(500),
});

const expenseBody = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: positiveMoney,
  expenseDate: dateValue.optional(),
  description: z.string().trim().min(3).max(500),
  payeeName: shortText(120).optional(),
  employeeId: objectId.optional(),
  projectId: objectId.optional(),
  siteId: objectId.optional(),
  vehicleId: objectId.optional(),
  itemId: objectId.optional(),
  referenceNo: optionalText(80),
  paymentModeNote: z.enum(PAYMENT_MODE_NOTES).optional(),
});

const expenseUpdate = expenseBody.partial();

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
  attachment: z.string().trim().min(1).max(500).nullable().optional(),
  employeeRemarks: optionalText(500),
});

const advanceUpdate = advanceBody.partial();

const rangeQuery = {
  from: dateValue.optional(),
  to: dateValue.optional(),
  projectId: objectId.optional(),
};

module.exports = {
  listSalaries: requestSchema({
    query: listQuery({
      ...includeVoid,
      employeeId: objectId.optional(),
      projectId: objectId.optional(),
      periodMonth: z.coerce.number().int().min(1).max(12).optional(),
      periodYear: z.coerce.number().int().min(2000).max(2100).optional(),
      recordStatus: z.enum(SALARY_RECORD_STATUS).optional(),
    }),
  }),
  createSalary: requestSchema({ body: salaryBody }),
  updateSalary: requestSchema({ params: idParams, body: salaryUpdate }),
  byId: requestSchema({ params: idParams }),
  voidSalary: requestSchema({ params: idParams, body: voidBody }),
  listExpenses: requestSchema({
    query: listQuery({
      ...includeVoid,
      category: z.enum(EXPENSE_CATEGORIES).optional(),
      employeeId: objectId.optional(),
      projectId: objectId.optional(),
      siteId: objectId.optional(),
      vehicleId: objectId.optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  createExpense: requestSchema({ body: expenseBody }),
  updateExpense: requestSchema({ params: idParams, body: expenseUpdate }),
  voidExpense: requestSchema({ params: idParams, body: voidBody }),
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
  listImpress: requestSchema({
    query: listQuery({
      ...includeVoid,
      employeeId: objectId.optional(),
      siteId: objectId.optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  createImpress: requestSchema({
    body: z.object({
      date: dateValue.optional(),
      employeeId: objectId,
      siteId: objectId,
      description: shortText(500),
      given: coercedMoney.refine((value) => value > 0, {
        message: 'Given amount must be greater than zero',
      }),
      notes: optionalText(500),
    }),
  }),
  updateImpress: requestSchema({
    params: idParams,
    body: z.object({
      date: dateValue.optional(),
      employeeId: objectId.optional(),
      siteId: objectId.optional(),
      description: shortText(500).optional(),
      given: coercedMoney.refine((value) => value > 0, {
        message: 'Given amount must be greater than zero',
      }).optional(),
      notes: optionalText(500),
    }),
  }),
  voidImpress: requestSchema({ params: idParams, body: voidBody }),
  listLocalExpenses: requestSchema({
    query: listQuery({
      ...includeVoid,
      employeeId: objectId.optional(),
      siteId: objectId.optional(),
      paymentMode: z.enum(PAYMENT_MODE_NOTES).optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  createLocalExpense: requestSchema({
    body: z.object({
      date: dateValue.optional(),
      employeeId: objectId,
      siteId: objectId.optional(),
      cashGiven: coercedMoney.refine((value) => value > 0, {
        message: 'Cash given must be greater than zero',
      }),
      expenseDetails: shortText(1000),
      returnAmount: coercedMoney.optional(),
      paymentMode: z.enum(PAYMENT_MODE_NOTES),
      receipt: z.string().trim().min(1).max(500).nullable().optional(),
    }),
  }),
  updateLocalExpense: requestSchema({
    params: idParams,
    body: z.object({
      date: dateValue.optional(),
      employeeId: objectId.optional(),
      siteId: objectId.optional(),
      cashGiven: coercedMoney.refine((value) => value > 0, {
        message: 'Cash given must be greater than zero',
      }).optional(),
      expenseDetails: shortText(1000).optional(),
      returnAmount: coercedMoney.optional(),
      paymentMode: z.enum(PAYMENT_MODE_NOTES).optional(),
      receipt: z.string().trim().min(1).max(500).nullable().optional(),
    }),
  }),
  employeeSite: requestSchema({
    params: z.object({ employeeId: objectId }),
  }),
};
