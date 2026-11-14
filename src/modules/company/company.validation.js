const {
  z,
  requestSchema,
  idParams,
  listQuery,
  shortText,
  optionalText,
  phone,
  email,
} = require('../../common/validators/zod');

const addressShape = z.object({
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(80),
  state: optionalText(80),
  pincode: optionalText(12),
  country: optionalText(80),
}).partial().optional();

const contactShape = z.object({
  email: email.or(z.literal('')).optional(),
  phone: z.union([phone, z.literal('')]).optional(),
  alternatePhone: z.union([phone, z.literal('')]).optional(),
  website: optionalText(200),
}).partial().optional();

const registrationShape = z.object({
  gstin: optionalText(20),
  pan: optionalText(12),
  cin: optionalText(30),
  tan: optionalText(20),
  registrationNumber: optionalText(60),
}).partial().optional();

const bankShape = z.object({
  bankName: optionalText(120),
  accountHolderName: optionalText(120),
  accountNumber: optionalText(30),
  ifscCode: optionalText(11),
  branchName: optionalText(120),
}).partial().optional();

const createBody = z.object({
  companyName: shortText(160),
  logo: z.string().trim().min(1).nullable().optional(),
  businessType: optionalText(120),
  description: optionalText(2000),
  establishedYear: z.coerce.number().int().min(1800).max(2100).optional(),
  contact: contactShape,
  registration: registrationShape,
  registeredAddress: addressShape,
  officeAddress: addressShape,
  bankDetails: bankShape,
});

const updateBody = z.object({
  companyName: shortText(160).optional(),
  logo: z.string().trim().min(1).nullable().optional(),
  businessType: optionalText(120),
  description: optionalText(2000),
  establishedYear: z.coerce.number().int().min(1800).max(2100).nullable().optional(),
  contact: contactShape,
  registration: registrationShape,
  registeredAddress: addressShape,
  officeAddress: addressShape,
  bankDetails: bankShape,
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
