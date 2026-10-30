const {
  UNITS,
  MOVEMENT_TYPES,
  MATERIAL_CONDITIONS,
  ADJUSTMENT_DIRECTIONS,
  PAYMENT_MODE_NOTES,
  STOCK_LOCATION_TYPES,
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

const reorderLevel = z
  .number()
  .finite()
  .min(0)
  .max(100000000)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, {
    message: 'Use at most 3 decimal places',
  });

const itemBody = z.object({
  sku: z.string().trim().min(1).max(40).optional(),
  name: shortText(120),
  category: shortText(40),
  unit: z.enum(UNITS),
  reorderLevel: reorderLevel.optional(),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});

const itemUpdate = itemBody.partial();

const locationBody = z.object({
  name: shortText(120),
  type: z.enum(STOCK_LOCATION_TYPES),
  siteId: objectId.optional(),
  isActive: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'site_store' && !data.siteId) {
    ctx.addIssue({ code: 'custom', path: ['siteId'], message: 'A site store must be linked to a site' });
  }
  if (data.type === 'central_store' && data.siteId) {
    ctx.addIssue({ code: 'custom', path: ['siteId'], message: 'A central store cannot be linked to a site' });
  }
});

const locationUpdate = z.object({
  name: shortText(120).optional(),
  isActive: z.boolean().optional(),
});

const movementBody = z.object({
  type: z.enum(MOVEMENT_TYPES),
  itemId: objectId,
  quantity,
  direction: z.enum(ADJUSTMENT_DIRECTIONS).optional(),
  fromLocationId: objectId.optional(),
  toLocationId: objectId.optional(),
  projectId: objectId.optional(),
  siteId: objectId.optional(),
  employeeId: objectId.optional(),
  vehicleTypeId: objectId.optional(),
  unitCost: money.optional(),
  vendorName: optionalText(120),
  condition: z.enum(MATERIAL_CONDITIONS).optional(),
  billNo: optionalText(80),
  challanNo: optionalText(80),
  materialReceiptPhoto: z.string().trim().min(1).max(500).nullable().optional(),
  paymentMode: z.enum(PAYMENT_MODE_NOTES).optional(),
  address: optionalText(300),
  movementDate: dateValue.optional(),
  reference: optionalText(80),
  remarks: optionalText(500),
}).superRefine((data, ctx) => {
  if (data.type === 'receipt' && !(data.vendorName && data.vendorName.trim())) {
    ctx.addIssue({ code: 'custom', path: ['vendorName'], message: 'Vendor name is required for an inward receipt' });
  }
  if (data.type === 'receipt' && !data.condition) {
    ctx.addIssue({ code: 'custom', path: ['condition'], message: 'Material condition is required for an inward receipt' });
  }
  if (data.type === 'receipt' && !(data.billNo || data.challanNo)) {
    ctx.addIssue({ code: 'custom', path: ['billNo'], message: 'Bill number or challan number is required for an inward receipt' });
  }
  if (data.type === 'receipt' && !data.paymentMode) {
    ctx.addIssue({ code: 'custom', path: ['paymentMode'], message: 'Mode of payment is required for an inward receipt' });
  }
  if (data.type === 'transfer' && (!data.fromLocationId || !data.toLocationId)) {
    ctx.addIssue({ code: 'custom', path: ['toLocationId'], message: 'Transfer needs both a source and a destination location' });
  }
  if (data.type === 'adjustment' && !data.direction) {
    ctx.addIssue({ code: 'custom', path: ['direction'], message: 'Adjustment direction is required' });
  }
});

module.exports = {
  listItems: requestSchema({
    query: listQuery({
      category: z.string().trim().max(40).optional(),
      isActive: z.enum(['true', 'false']).optional().transform((value) => (value === undefined ? undefined : value === 'true')),
    }),
  }),
  createItem: requestSchema({ body: itemBody }),
  updateItem: requestSchema({ params: idParams, body: itemUpdate }),
  listLocations: requestSchema({
    query: listQuery({
      type: z.enum(STOCK_LOCATION_TYPES).optional(),
      siteId: objectId.optional(),
    }),
  }),
  createLocation: requestSchema({ body: locationBody }),
  updateLocation: requestSchema({ params: idParams, body: locationUpdate }),
  byId: requestSchema({ params: idParams }),
  listStock: requestSchema({
    query: listQuery({
      itemId: objectId.optional(),
      locationId: objectId.optional(),
    }),
  }),
  listMovements: requestSchema({
    query: listQuery({
      itemId: objectId.optional(),
      locationId: objectId.optional(),
      projectId: objectId.optional(),
      siteId: objectId.optional(),
      employeeId: objectId.optional(),
      vehicleTypeId: objectId.optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  listIssues: requestSchema({
    query: listQuery({
      itemId: objectId.optional(),
      locationId: objectId.optional(),
      projectId: objectId.optional(),
      siteId: objectId.optional(),
      employeeId: objectId.optional(),
      vehicleTypeId: objectId.optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  createMovement: requestSchema({ body: movementBody }),
  updateMovement: requestSchema({
    params: idParams,
    body: z.object({
      itemId: objectId.optional(),
      quantity: quantity.optional(),
      direction: z.enum(ADJUSTMENT_DIRECTIONS).optional(),
      fromLocationId: objectId.optional(),
      toLocationId: objectId.optional(),
      projectId: objectId.nullable().optional(),
      siteId: objectId.nullable().optional(),
      employeeId: objectId.nullable().optional(),
      vehicleTypeId: objectId.nullable().optional(),
      unitCost: money.optional(),
      vendorName: optionalText(120),
      condition: z.enum(MATERIAL_CONDITIONS).optional(),
      billNo: optionalText(80),
      challanNo: optionalText(80),
      materialReceiptPhoto: z.string().trim().min(1).max(500).nullable().optional(),
      paymentMode: z.enum(PAYMENT_MODE_NOTES).optional(),
      address: optionalText(300),
      movementDate: dateValue.optional(),
      reference: optionalText(80),
      remarks: optionalText(500),
    }),
  }),
  updateIssue: requestSchema({
    params: idParams,
    body: z.object({
      itemId: objectId.optional(),
      quantity: quantity.optional(),
      fromLocationId: objectId.optional(),
      projectId: objectId.nullable().optional(),
      siteId: objectId.nullable().optional(),
      employeeId: objectId.nullable().optional(),
      vehicleTypeId: objectId.nullable().optional(),
      movementDate: dateValue.optional(),
      reference: optionalText(80),
      remarks: optionalText(500),
    }),
  }),
};
