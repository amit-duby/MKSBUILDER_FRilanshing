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

const moneyEntry = z.object({
  amount: money,
  date: dateValue,
  note: optionalText(300),
});

const createBody = z.object({
  projectId: objectId,
  clientName: shortText(120),
  clientPhoneNo: phone.optional(),
  description: optionalText(2000),
  status: z.enum(PROJECT_STATUS).optional(),
  startDate: dateValue,
  actualEndDate: dateValue.optional(),
  budgetAmount: money.optional(),
  installmentType: optionalText(120),
  projectImage: z.string().trim().min(1).nullable().optional(),
  bestProject: z.boolean().optional(),
  clientInstallments: z.array(moneyEntry).max(100).optional(),
  projectSpends: z.array(moneyEntry).max(200).optional(),
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
  installmentType: optionalText(120).nullable(),
  projectImage: z.string().trim().min(1).nullable().optional(),
  bestProject: z.boolean().optional(),
});

const moneyEntryBody = z.object({
  amount: money,
  date: dateValue,
  note: optionalText(300),
});

const entryParams = z.object({
  id: objectId,
  entryId: objectId,
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      projectId: objectId.optional(),
      status: z.enum(PROJECT_STATUS).optional(),
      bestProject: z.coerce.boolean().optional(),
    }),
  }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
  addClientInstallment: requestSchema({ params: idParams, body: moneyEntryBody }),
  removeClientInstallment: requestSchema({ params: entryParams }),
  addProjectSpend: requestSchema({ params: idParams, body: moneyEntryBody }),
  removeProjectSpend: requestSchema({ params: entryParams }),
};
