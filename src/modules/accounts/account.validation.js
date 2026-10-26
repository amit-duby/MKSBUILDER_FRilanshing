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
};
