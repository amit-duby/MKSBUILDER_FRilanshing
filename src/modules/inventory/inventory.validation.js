const {
  STOCK_LOCATION_TYPES,
  MOVEMENT_TYPES,
  MATERIAL_CONDITIONS,
  ADJUSTMENT_DIRECTIONS,
  PAYMENT_MODE_NOTES,
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
  unit: shortText(40),
  reorderLevel: reorderLevel.optional(),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});

const itemUpdate = itemBody.partial();

const withVehicleTypeAlias = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const body = { ...value };
  if (!body.vehicleTypeId && body.vehicleType) body.vehicleTypeId = body.vehicleType;
  return body;
};

const movementBody = z.preprocess(withVehicleTypeAlias, z.object({
  type: z.enum(MOVEMENT_TYPES),
  itemId: objectId,
  quantity,
  direction: z.enum(ADJUSTMENT_DIRECTIONS).optional(),
  fromLocation: optionalText(120),
  toLocation: optionalText(120),
  locationType: z.enum(STOCK_LOCATION_TYPES).optional(),
  siteId: objectId.optional(),
  employeeId: objectId.optional(),
  vehicleTypeId: objectId.optional(),
  unitCost: money.optional(),
  vendorName: optionalText(120),
  condition: z.enum(MATERIAL_CONDITIONS).optional(),
  billNo: optionalText(80),
  challanNo: optionalText(80),
  materialReceiptPhoto: z.string().trim().min(1).nullable().optional(),
  paymentMode: z.enum(PAYMENT_MODE_NOTES).optional(),
  address: optionalText(300),
  movementDate: dateValue.optional(),
  reference: optionalText(80),
  remarks: optionalText(500),
  note: optionalText(500),
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
  if (data.type === 'transfer' && (!(data.fromLocation && data.fromLocation.trim()) || !(data.toLocation && data.toLocation.trim()))) {
    ctx.addIssue({ code: 'custom', path: ['toLocation'], message: 'Transfer needs both a source and a destination location' });
  }
  if (data.type === 'adjustment' && !data.direction) {
    ctx.addIssue({ code: 'custom', path: ['direction'], message: 'Adjustment direction is required' });
  }
}));

const issueBody = z.preprocess(withVehicleTypeAlias, z.object({
  type: z.literal('issue').optional().default('issue'),
  itemId: objectId,
  quantity,
  fromLocation: optionalText(120),
  toLocation: optionalText(120),
  locationType: z.enum(STOCK_LOCATION_TYPES).optional(),
  siteId: objectId.optional(),
  employeeId: objectId.optional(),
  vehicleTypeId: objectId.optional(),
  movementDate: dateValue.optional(),
  remarks: optionalText(500),
  note: optionalText(500),
}));

module.exports = {
  listItems: requestSchema({
    query: listQuery({
      category: z.string().trim().max(40).optional(),
      isActive: z.enum(['true', 'false']).optional().transform((value) => (value === undefined ? undefined : value === 'true')),
    }),
  }),
  createItem: requestSchema({ body: itemBody }),
  updateItem: requestSchema({ params: idParams, body: itemUpdate }),
  byId: requestSchema({ params: idParams }),
  listStock: requestSchema({
    query: listQuery({
      itemId: objectId.optional(),
      location: optionalText(120),
    }),
  }),
  listMovements: requestSchema({
    query: listQuery({
      itemId: objectId.optional(),
      location: optionalText(120),
      locationType: z.enum(STOCK_LOCATION_TYPES).optional(),
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
      location: optionalText(120),
      locationType: z.enum(STOCK_LOCATION_TYPES).optional(),
      siteId: objectId.optional(),
      employeeId: objectId.optional(),
      vehicleTypeId: objectId.optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  createMovement: requestSchema({ body: movementBody }),
  createIssue: requestSchema({ body: issueBody }),
  updateMovement: requestSchema({
    params: idParams,
    body: z.object({
      itemId: objectId.optional(),
      quantity: quantity.optional(),
      direction: z.enum(ADJUSTMENT_DIRECTIONS).optional(),
      fromLocation: optionalText(120),
      toLocation: optionalText(120),
      locationType: z.enum(STOCK_LOCATION_TYPES).optional(),
      siteId: objectId.nullable().optional(),
      employeeId: objectId.nullable().optional(),
      vehicleTypeId: objectId.nullable().optional(),
      unitCost: money.optional(),
      vendorName: optionalText(120),
      condition: z.enum(MATERIAL_CONDITIONS).optional(),
      billNo: optionalText(80),
      challanNo: optionalText(80),
      materialReceiptPhoto: z.string().trim().min(1).nullable().optional(),
      paymentMode: z.enum(PAYMENT_MODE_NOTES).optional(),
      address: optionalText(300),
      movementDate: dateValue.optional(),
      reference: optionalText(80),
      remarks: optionalText(500),
      note: optionalText(500),
    }),
  }),
  updateIssue: requestSchema({
    params: idParams,
    body: z.preprocess(withVehicleTypeAlias, z.object({
      type: z.literal('issue').optional(),
      itemId: objectId.optional(),
      quantity: quantity.optional(),
      fromLocation: optionalText(120),
      toLocation: optionalText(120),
      locationType: z.enum(STOCK_LOCATION_TYPES).optional(),
      siteId: objectId.nullable().optional(),
      employeeId: objectId.nullable().optional(),
      vehicleTypeId: objectId.nullable().optional(),
      movementDate: dateValue.optional(),
      remarks: optionalText(500),
      note: optionalText(500),
    })),
  }),
};
