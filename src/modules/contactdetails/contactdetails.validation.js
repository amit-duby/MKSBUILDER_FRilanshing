const {
  z,
  requestSchema,
  idParams,
  listQuery,
  shortText,
  email,
  phone,
} = require('../../common/validators/zod');

const createBody = z.object({
  firstPhone: phone,
  email,
  secondPhone: phone.nullable().optional(),
  address: shortText(1000),
});

const updateBody = z.object({
  firstPhone: phone.optional(),
  email: email.optional(),
  secondPhone: phone.nullable().optional(),
  address: shortText(1000).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Provide at least one field to update',
});

module.exports = {
  list: requestSchema({
    query: listQuery(),
  }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
};
