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
  vehicleTypeId: objectId,
  make: optionalText(80),
  modelName: optionalText(80),
  year: z.coerce.number().int().min(1980).max(2100).optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  odometer: z.number().finite().min(0).optional(),
  documents: z.object(documentShape).optional(),
  notes: optionalText(1000),
};

const createBody = z.object(vehicleFields);

const updateBody = z.object(vehicleFields).partial().extend({
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

const maintenanceBody = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const body = { ...value };
  if (!body.vehicleId) {
    body.vehicleId = body.vehicle;
  }
  if (!body.maintenanceCategoryId) {
    body.maintenanceCategoryId = body.maintenanceCategory || body.categoryId;
  }
  return body;
}, z.object({
  vehicleId: objectId,
  maintenanceCategoryId: objectId,
  paidTo: shortText(120),
  date: dateValue.optional(),
  amount: money,
  modeOfPayment: z.enum(PAYMENT_MODE_NOTES),
  reference: optionalText(80),
  uploadReceipt: z.string().trim().min(1).optional(),
  description: z.string().trim().min(3).max(500).optional(),
  recordExpense: z.boolean().optional(),
  payeeName: shortText(120).optional(),
  paymentModeNote: z.enum(PAYMENT_MODE_NOTES).optional(),
}));

const updateMaintenanceBody = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const body = { ...value };
  if (!body.maintenanceCategoryId) {
    body.maintenanceCategoryId = body.maintenanceCategory || body.categoryId;
  }
  return body;
}, z.object({
  maintenanceCategoryId: objectId.optional(),
  paidTo: shortText(120).optional(),
  date: dateValue.optional(),
  amount: money.optional(),
  modeOfPayment: z.enum(PAYMENT_MODE_NOTES).optional(),
  reference: optionalText(80),
  uploadReceipt: z.string().trim().min(1).optional(),
  description: z.string().trim().min(3).max(500).optional(),
  recordExpense: z.boolean().optional(),
  payeeName: shortText(120).optional(),
  paymentModeNote: z.enum(PAYMENT_MODE_NOTES).optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: 'Provide at least one field to update',
}));

module.exports = {
  list: requestSchema({
    query: listQuery({
      status: z.enum(VEHICLE_STATUS).optional(),
      vehicleTypeId: objectId.optional(),
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
  listAllAssignments: requestSchema({
    query: listQuery({
      vehicleId: objectId.optional(),
      siteId: objectId.optional(),
      driverId: objectId.optional(),
      current: z.enum(['true', 'false']).optional().transform((value) => (
        value === undefined ? undefined : value === 'true'
      )),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  listAllMaintenance: requestSchema({
    query: listQuery({
      vehicleId: objectId.optional(),
      maintenanceCategoryId: objectId.optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  assign: requestSchema({ params: idParams, body: assignBody }),
  release: requestSchema({ params: idParams, body: releaseBody }),
  maintenance: requestSchema({ body: maintenanceBody }),
  updateMaintenance: requestSchema({ params: idParams, body: updateMaintenanceBody }),
  pagedChild: requestSchema({
    params: idParams,
    query: listQuery(),
  }),
};
