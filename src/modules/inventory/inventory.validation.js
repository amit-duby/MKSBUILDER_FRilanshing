const {
  UNITS,
  MOVEMENT_TYPES,
  MOVEMENT_STATUS,
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

const itemBody = z.object({
  name: shortText(120),
  units: z.enum(UNITS),
  description: optionalText(500),
  isActive: z.boolean().optional(),
});

const itemUpdate = itemBody.partial();

const movementBody = z.object({
  type: z.enum(MOVEMENT_TYPES),
  status: z.enum(MOVEMENT_STATUS),
  itemId: objectId,
  quantity,
  direction: z.enum(ADJUSTMENT_DIRECTIONS).optional(),
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
  if (data.type === 'transfer') {
    ctx.addIssue({ code: 'custom', path: ['type'], message: 'Stock transfer is not supported' });
  }
  if (data.type === 'adjustment' && !data.direction) {
    ctx.addIssue({ code: 'custom', path: ['direction'], message: 'Adjustment direction is required' });
  }
});

module.exports = {
  listItems: requestSchema({
    query: listQuery({
      isActive: z.enum(['true', 'false']).optional().transform((value) => (value === undefined ? undefined : value === 'true')),
    }),
  }),
  createItem: requestSchema({ body: itemBody }),
  updateItem: requestSchema({ params: idParams, body: itemUpdate }),
  byId: requestSchema({ params: idParams }),
  listStock: requestSchema({
    query: listQuery({
      itemId: objectId.optional(),
      below: z.coerce.number().finite().min(0).max(100000000).optional(),
    }),
  }),
  listMovements: requestSchema({
    query: listQuery({
      itemId: objectId.optional(),
      projectId: objectId.optional(),
      siteId: objectId.optional(),
      employeeId: objectId.optional(),
      vehicleTypeId: objectId.optional(),
      status: z.enum(MOVEMENT_STATUS).optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  listIssues: requestSchema({
    query: listQuery({
      itemId: objectId.optional(),
      projectId: objectId.optional(),
      siteId: objectId.optional(),
      employeeId: objectId.optional(),
      vehicleTypeId: objectId.optional(),
      status: z.enum(MOVEMENT_STATUS).optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  createMovement: requestSchema({ body: movementBody }),
  updateMovement: requestSchema({
    params: idParams,
    body: z.object({
      status: z.enum(MOVEMENT_STATUS).optional(),
      itemId: objectId.optional(),
      quantity: quantity.optional(),
      direction: z.enum(ADJUSTMENT_DIRECTIONS).optional(),
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
      status: z.enum(MOVEMENT_STATUS).optional(),
      itemId: objectId.optional(),
      quantity: quantity.optional(),
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
