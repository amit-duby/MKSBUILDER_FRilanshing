const {
  VEHICLE_STATUS,
  FUEL_TYPES,
  MAINTENANCE_TYPES,
  PAYMENT_MODE_NOTES,
  DOCUMENT_EXPIRY_FIELDS,
} = require('../../config/constants');
const {
  z,
  objectId,
  money,
  quantity,
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

const createBody = z.object({
  registrationNumber: shortText(20),
  type: shortText(40),
  make: optionalText(80),
  modelName: optionalText(80),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  odometer: z.number().finite().min(0).optional(),
  documents: z.object(documentShape).optional(),
  notes: optionalText(1000),
});

const updateBody = createBody.partial().extend({
  registrationNumber: shortText(20).optional(),
  status: z.enum(['available', 'inactive']).optional(),
});

const assignBody = z.object({
  siteId: objectId,
  driverId: objectId.optional(),
  assignedAt: dateValue.optional(),
  remarks: optionalText(300),
});

const releaseBody = z.object({
  releasedAt: dateValue.optional(),
  remarks: optionalText(300),
});

const maintenanceBody = z.object({
  loggedAt: dateValue.optional(),
  type: z.enum(MAINTENANCE_TYPES),
  description: z.string().trim().min(3).max(500),
  cost: money,
  odometer: z.number().finite().min(0).optional(),
  vendorName: optionalText(120),
  nextDueDate: dateValue.optional(),
  recordExpense: z.boolean().optional(),
  payeeName: shortText(120).optional(),
  paymentModeNote: z.enum(PAYMENT_MODE_NOTES).optional(),
});

const completeBody = z.object({
  completedAt: dateValue.optional(),
  completionNote: optionalText(500),
});

const fuelBody = z.object({
  loggedAt: dateValue.optional(),
  liters: quantity,
  amount: money.refine((value) => value > 0, { message: 'Amount must be greater than zero' }),
  odometer: z.number().finite().min(0).optional(),
  siteId: objectId.optional(),
  remarks: optionalText(300),
  recordExpense: z.boolean().optional(),
  payeeName: shortText(120).optional(),
  paymentModeNote: z.enum(PAYMENT_MODE_NOTES).optional(),
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
  assign: requestSchema({ params: idParams, body: assignBody }),
  release: requestSchema({ params: idParams, body: releaseBody }),
  maintenance: requestSchema({ params: idParams, body: maintenanceBody }),
  complete: requestSchema({ params: maintenanceParams, body: completeBody }),
  fuel: requestSchema({ params: idParams, body: fuelBody }),
  pagedChild: requestSchema({
    params: idParams,
    query: listQuery(),
  }),
};
