const { EMPLOYMENT_TYPES, EMPLOYEE_STATUS, PAY_BASIS } = require('../../config/constants');
const {
  z,
  objectId,
  money,
  requestSchema,
  idParams,
  listQuery,
  shortText,
  optionalText,
  phone,
  email,
  dateValue,
  amountLine,
} = require('../../common/validators/zod');

const ifscCode = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, '').toUpperCase())
  .refine(
    (value) => value === '' || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value),
    'Use 11 characters: 4 letters, then 0, then 6 letters or digits'
  );

const accountNumber = z
  .string()
  .trim()
  .regex(/^[0-9]{9,18}$/, 'Account number must be 9 to 18 digits');

const photoPath = z.string().trim().min(1).max(500);

const identityShape = {
  idType: optionalText(40),
  idNumber: optionalText(40),
  profilePhoto: photoPath.nullable().optional(),
  idPhotos: z.array(photoPath).max(6).optional(),
  bankName: optionalText(120),
  accountNumber: accountNumber.optional(),
  ifscCode: ifscCode.optional(),
};

const salaryShape = {
  payBasis: z.enum(PAY_BASIS).optional(),
  baseAmount: money,
  allowances: z.array(amountLine).max(20).optional(),
};

const createBody = z.object({
  fullName: shortText(120),
  phone: phone.optional(),
  email: email.optional(),
  address: optionalText(300),
  departmentId: objectId,
  designation: shortText(80),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  status: z.enum(['active', 'inactive']).optional(),
  joiningDate: dateValue,
  relievingDate: dateValue.optional(),
  salary: z.object(salaryShape),
  notes: optionalText(1000),
  siteId: objectId.optional(),
  ...identityShape,
}).superRefine((data, ctx) => {
  if (data.status === 'resigned' && !data.relievingDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['relievingDate'],
      message: 'Relieving date is required when status is resigned',
    });
  }
  if (data.relievingDate && data.relievingDate < data.joiningDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['relievingDate'],
      message: 'Relieving date must be on or after the joining date',
    });
  }
});

const updateBody = z.object({
  fullName: shortText(120).optional(),
  phone: phone.nullable().optional(),
  email: email.nullable().optional(),
  address: optionalText(300),
  departmentId: objectId.optional(),
  designation: shortText(80).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  status: z.enum(EMPLOYEE_STATUS).optional(),
  joiningDate: dateValue.optional(),
  relievingDate: dateValue.nullable().optional(),
  salary: z.object({
    payBasis: z.enum(PAY_BASIS).optional(),
    baseAmount: money.optional(),
    allowances: z.array(amountLine).max(20).optional(),
  }).optional(),
  notes: optionalText(1000),
  siteId: objectId.nullable().optional(),
  idType: optionalText(40),
  idNumber: optionalText(40).nullable(),
  profilePhoto: photoPath.nullable().optional(),
  idPhotos: z.array(photoPath).max(6).optional(),
  bankName: optionalText(120),
  accountNumber: accountNumber.nullable().optional(),
  ifscCode: ifscCode.nullable().optional(),
});

const assignBody = z.object({
  siteId: objectId,
  startDate: dateValue.optional(),
  remarks: optionalText(300),
});

const releaseBody = z.object({
  endDate: dateValue.optional(),
});

const assignmentParams = z.object({
  id: objectId,
  assignmentId: objectId,
});

module.exports = {
  list: requestSchema({
    query: listQuery({
      departmentId: objectId.optional(),
      siteId: objectId.optional(),
      status: z.enum(EMPLOYEE_STATUS).optional(),
      employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    }),
  }),
  create: requestSchema({ body: createBody }),
  update: requestSchema({ params: idParams, body: updateBody }),
  byId: requestSchema({ params: idParams }),
  assign: requestSchema({ params: idParams, body: assignBody }),
  release: requestSchema({ params: assignmentParams, body: releaseBody }),
  assignments: requestSchema({
    params: idParams,
    query: z.object({
      current: z.enum(['true', 'false']).optional().transform((value) => (value === undefined ? undefined : value === 'true')),
    }),
  }),
};
