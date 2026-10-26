const { SITE_STATUS } = require('../../config/constants');
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

const createBody = z.object({
  projectId: objectId,
  name: shortText(120),
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  pincode: z.string().trim().max(12).optional(),
  status: z.enum(SITE_STATUS).optional(),
  inchargeId: objectId.optional(),
  startDate: dateValue,
  expectedEndDate: dateValue.optional(),
  notes: optionalText(1000),
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
  address: optionalText(300),
  city: optionalText(80),
  state: optionalText(80),
  pincode: z.string().trim().max(12).optional(),
  status: z.enum(SITE_STATUS).optional(),
  inchargeId: objectId.nullable().optional(),
  startDate: dateValue.optional(),
  expectedEndDate: dateValue.nullable().optional(),
  notes: optionalText(1000),
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      projectId: objectId.optional(),
      status: z.enum(SITE_STATUS).optional(),
    }),
  }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
};
