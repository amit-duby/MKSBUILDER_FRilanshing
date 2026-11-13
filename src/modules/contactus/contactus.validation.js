const {
  z,
  requestSchema,
  idParams,
  listQuery,
  shortText,
  email,
} = require('../../common/validators/zod');

const createBody = z.object({
  name: shortText(120),
  email,
  projectType: shortText(120),
  details: z.string().trim().min(1).max(5000),
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      projectType: z.string().trim().max(120).optional(),
    }),
  }),
  create: requestSchema({ body: createBody }),
  byId: requestSchema({ params: idParams }),
};
