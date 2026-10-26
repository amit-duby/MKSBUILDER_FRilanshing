const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const money = z
  .number()
  .finite()
  .min(0)
  .max(999999999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Use at most 2 decimal places',
  });

const quantity = z
  .number()
  .finite()
  .positive()
  .max(100000000)
  .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6, {
    message: 'Use at most 3 decimal places',
  });

const shortText = (max = 120) => z.string().trim().min(1).max(max);
const optionalText = (max = 500) => z.string().trim().max(max).optional();
const phone = z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number');
const email = z.string().trim().email().max(160);
const dateValue = z.coerce.date();

const amountLine = z.object({
  name: shortText(80),
  amount: money,
});

const idParams = z.object({
  id: objectId,
});

function listQuery(shape = {}) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(80).optional(),
    sort: z.string().trim().max(40).optional(),
    includeArchived: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
    ...shape,
  });
}

function requestSchema(shape) {
  return z.object(shape);
}

module.exports = {
  z,
  objectId,
  money,
  quantity,
  shortText,
  optionalText,
  phone,
  email,
  dateValue,
  amountLine,
  idParams,
  listQuery,
  requestSchema,
};
