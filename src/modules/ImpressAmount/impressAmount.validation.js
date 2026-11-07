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
  date: dateValue,
  employeeId: objectId,
  givenTo: shortText(120),
  siteId: objectId,
  note: optionalText(500),
});

const updateBody = z.object({
  date: dateValue.optional(),
  employeeId: objectId.optional(),
  givenTo: shortText(120).optional(),
  siteId: objectId.optional(),
  note: optionalText(500),
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      employeeId: objectId.optional(),
      siteId: objectId.optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
};
