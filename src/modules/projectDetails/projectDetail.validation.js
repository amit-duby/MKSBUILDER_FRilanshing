const { PROJECT_STATUS } = require('../../config/constants');
const {
  z,
  objectId,
  money,
  requestSchema,
  idParams,
  listQuery,
  shortText,
  optionalText,
  phone,
  dateValue,
} = require('../../common/validators/zod');

const createBody = z.object({
  projectId: objectId,
  clientName: shortText(120),
  clientPhoneNo: phone.optional(),
  description: optionalText(2000),
  status: z.enum(PROJECT_STATUS).optional(),
  startDate: dateValue,
  actualEndDate: dateValue.optional(),
  budgetAmount: money.optional(),
  clientAmount: money.optional(),
  moneySpend: money.optional(),
  installmentType: optionalText(120),
}).superRefine((data, ctx) => {
  if (data.actualEndDate && data.actualEndDate < data.startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['actualEndDate'],
      message: 'Actual end date must be on or after the start date',
    });
  }
});

const updateBody = z.object({
  projectId: objectId.optional(),
  clientName: shortText(120).optional(),
  clientPhoneNo: phone.nullable().optional(),
  description: optionalText(2000),
  status: z.enum(PROJECT_STATUS).optional(),
  startDate: dateValue.optional(),
  actualEndDate: dateValue.nullable().optional(),
  budgetAmount: money.nullable().optional(),
  clientAmount: money.nullable().optional(),
  moneySpend: money.nullable().optional(),
  installmentType: optionalText(120).nullable(),
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      projectId: objectId.optional(),
      status: z.enum(PROJECT_STATUS).optional(),
    }),
  }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
};
