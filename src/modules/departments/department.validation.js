const {
  z,
  requestSchema,
  idParams,
  listQuery,
  shortText,
  optionalText,
} = require('../../common/validators/zod');

const createBody = z.object({
  name: shortText(120),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});

const updateBody = z.object({
  name: shortText(120).optional(),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});

module.exports = {
  list: requestSchema({ query: listQuery() }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
};
