const {
  UNITS,
  MOVEMENT_TYPES,
  ADJUSTMENT_DIRECTIONS,
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
  unitCost: money.optional(),
  movementDate: dateValue.optional(),
  reference: optionalText(80),
  remarks: optionalText(500),
}).superRefine((data, ctx) => {
  if ((data.type === 'receipt' || data.type === 'return') && !data.toLocationId) {
    ctx.addIssue({ code: 'custom', path: ['toLocationId'], message: 'Destination location is required' });
  }
  if (data.type === 'issue' && !data.fromLocationId) {
    ctx.addIssue({ code: 'custom', path: ['fromLocationId'], message: 'Source location is required' });
  }
  if (data.type === 'transfer' && (!data.fromLocationId || !data.toLocationId)) {
    ctx.addIssue({ code: 'custom', path: ['fromLocationId'], message: 'Source and destination locations are required' });
  }
  if (data.type === 'adjustment' && (!data.direction || (!data.fromLocationId && !data.toLocationId))) {
    ctx.addIssue({ code: 'custom', path: ['direction'], message: 'Direction and location are required' });
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
      type: z.enum(MOVEMENT_TYPES).optional(),
      itemId: objectId.optional(),
      locationId: objectId.optional(),
      projectId: objectId.optional(),
      siteId: objectId.optional(),
      from: dateValue.optional(),
      to: dateValue.optional(),
    }),
  }),
  createMovement: requestSchema({ body: movementBody }),
};
