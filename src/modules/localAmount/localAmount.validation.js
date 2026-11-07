const { PAYMENT_MODE_NOTES } = require('../../config/constants');
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
} = require('../../common/validators/zod');

const createBody = z.object({
  date: dateValue,
  impressAmountId: objectId,
  details: shortText(500),
  returnAmount: money,
  paymentMode: z.enum(PAYMENT_MODE_NOTES),
  uploadReceipt: z.string().trim().min(1).optional(),
});

const updateBody = z.object({
  date: dateValue.optional(),
  impressAmountId: objectId.optional(),
  details: shortText(500).optional(),
  returnAmount: money.optional(),
  paymentMode: z.enum(PAYMENT_MODE_NOTES).optional(),
  uploadReceipt: z.string().trim().min(1).nullable().optional(),
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      impressAmountId: objectId.optional(),
      paymentMode: z.enum(PAYMENT_MODE_NOTES).optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
};
