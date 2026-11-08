const {
  z,
  requestSchema,
  idParams,
  listQuery,
  shortText,
  optionalText,
  dateValue,
} = require('../../common/validators/zod');

const createBody = z.object({
  name: shortText(120),
  date: dateValue,
  description: optionalText(2000),
  image: z.string().trim().min(1).max(500).optional(),
});

const updateBody = z.object({
  name: shortText(120).optional(),
  date: dateValue.optional(),
  description: optionalText(2000),
  image: z.string().trim().min(1).max(500).nullable().optional(),
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
};
