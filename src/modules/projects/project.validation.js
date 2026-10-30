const { PROJECT_STATUS } = require('../../config/constants');
const {
  z,
  requestSchema,
  idParams,
  listQuery,
  shortText,
  optionalText,
  phone,
  money,
  dateValue,
} = require('../../common/validators/zod');

const createBody = z.object({
  name: shortText(120),
  clientName: shortText(120),
  clientPhone: phone.optional(),
  description: optionalText(2000),
  status: z.enum(PROJECT_STATUS).optional(),
  startDate: dateValue,
  expectedEndDate: dateValue.optional(),
  budgetAmount: money.optional(),
  clientAmount: money.optional(),
  moneySpent: money.optional(),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  pincode: z.string().trim().max(12).optional(),
}).superRefine((data, ctx) => {
  if (data.expectedEndDate && data.expectedEndDate < data.startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['expectedEndDate'],
      message: 'Expected end date must be on or after the start date',
    });
  }
});

const updateBody = z.object({
  name: shortText(120).optional(),
  clientName: shortText(120).optional(),
  clientPhone: phone.nullable().optional(),
  description: optionalText(2000),
  status: z.enum(PROJECT_STATUS).optional(),
  startDate: dateValue.optional(),
  expectedEndDate: dateValue.nullable().optional(),
  actualEndDate: dateValue.nullable().optional(),
  budgetAmount: money.nullable().optional(),
  clientAmount: money.nullable().optional(),
  moneySpent: money.nullable().optional(),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  pincode: z.string().trim().max(12).nullable().optional(),
});

const list = requestSchema({
  query: listQuery({
    status: z.enum(PROJECT_STATUS).optional(),
  }),
});

const create = requestSchema({ body: createBody });
const update = requestSchema({ params: idParams, body: updateBody });
const byId = requestSchema({ params: idParams });

module.exports = { list, create, update, byId };
