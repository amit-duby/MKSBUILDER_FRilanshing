const { PROJECT_STATUS } = require('../../config/constants');
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
  description: optionalText(2000),
  status: z.enum(PROJECT_STATUS).optional(),
});

const updateBody = z.object({
  name: shortText(120).optional(),
  description: optionalText(2000),
  status: z.enum(PROJECT_STATUS).optional(),
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
