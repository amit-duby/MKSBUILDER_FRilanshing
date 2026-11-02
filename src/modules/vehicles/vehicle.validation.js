const {
  VEHICLE_STATUS,
  FUEL_TYPES,
  PAYMENT_MODE_NOTES,
  DOCUMENT_EXPIRY_FIELDS,
} = require('../../config/constants');
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

const documentShape = {};
for (const field of DOCUMENT_EXPIRY_FIELDS) {
  documentShape[field] = dateValue.nullable().optional();
}

const vehicleFields = {
  registrationNumber: shortText(20),
  type: shortText(40),
  make: optionalText(80),
  modelName: optionalText(80),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  odometer: z.number().finite().min(0).optional(),
  documents: z.object(documentShape).optional(),
  notes: optionalText(1000),
};

const createBody = z.object({
  ...vehicleFields,
  siteId: objectId.optional(),
  employeeId: objectId.optional(),
  driverId: objectId.optional(),
});

const updateBody = z.object(vehicleFields).partial().extend({
  registrationNumber: shortText(20).optional(),
  status: z.enum(['available', 'inactive']).optional(),
  siteId: objectId.nullable().optional(),
  employeeId: objectId.nullable().optional(),
});

const photoPath = z.string().trim().min(1).max(500);

const maintenanceBody = z.object({
  category: objectId,
  description: z.string().trim().min(3).max(500),
  singleImage: photoPath.nullable().optional(),
  paidTo: shortText(120),
  amountType: z.enum(PAYMENT_MODE_NOTES),
  amount: money,
  date: dateValue.optional(),
  referenceNo: optionalText(80),
});

const completeBody = z.object({
  completedAt: dateValue.optional(),
  singleImage: photoPath.nullable().optional(),
});

const maintenanceParams = z.object({
  id: objectId,
  maintenanceId: objectId,
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      status: z.enum(VEHICLE_STATUS).optional(),
      type: shortText(40).optional(),
      siteId: objectId.optional(),
      employeeId: objectId.optional(),
    }),
  }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
  alerts: requestSchema({
    query: z.object({
      withinDays: z.coerce.number().int().min(1).max(365).default(30),
    }),
  }),
  maintenance: requestSchema({ params: idParams, body: maintenanceBody }),
  complete: requestSchema({ params: maintenanceParams, body: completeBody }),
  deleteMaintenance: requestSchema({ params: maintenanceParams }),
  pagedChild: requestSchema({
    params: idParams,
    query: listQuery(),
  }),
};
