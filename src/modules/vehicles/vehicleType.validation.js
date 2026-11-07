const { VEHICLE_TYPE_STATUS } = require('../../config/constants');
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
  status: z.enum(VEHICLE_TYPE_STATUS).optional(),
});

const updateBody = z.object({
  name: shortText(120).optional(),
  description: optionalText(500),
  status: z.enum(VEHICLE_TYPE_STATUS).optional(),
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      status: z.enum(VEHICLE_TYPE_STATUS).optional(),
    }),
  }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
};
