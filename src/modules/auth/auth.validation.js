const {
  z,
  requestSchema,
  shortText,
  optionalText,
  phone,
} = require('../../common/validators/zod');

const credentials = {
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
};

const register = requestSchema({
  body: z.object({
    name: shortText(120),
    phone: phone.optional(),
    ...credentials,
  }),
});

const login = requestSchema({
  body: z.object(credentials),
});

const refresh = requestSchema({
  body: z.object({
    refreshToken: z.string().trim().min(20).max(2048),
  }),
});

const forgotPassword = requestSchema({
  body: z.object({
    email: z.string().trim().email(),
  }),
});

const resetPassword = requestSchema({
  params: z.object({
    token: z.string().trim().min(32).max(256),
  }),
  body: z.object({
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  }).superRefine((data, ctx) => {
    if (data.confirmPassword !== data.password) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'password does not match',
      });
    }
  }),
});

const changePassword = requestSchema({
  body: z.object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  }).superRefine((data, ctx) => {
    if (data.confirmPassword !== data.newPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Confirm password must match the new password',
      });
    }
  }),
});

const profile = requestSchema({
  body: z.object({
    name: shortText(120).optional(),
    phone: z.union([phone, z.literal('')]).nullable().optional(),
    address: optionalText(300),
    city: optionalText(80),
    state: optionalText(80),
    pincode: optionalText(12),
    country: optionalText(80),
  }).refine(
    (data) => ['name', 'phone', 'address', 'city', 'state', 'pincode', 'country']
      .some((field) => data[field] !== undefined),
    {
      message: 'Provide at least one profile field (name, phone, address, city, state, pincode, country)',
    }
  ),
});

module.exports = {
  register,
  login,
  refresh,
  forgotPassword,
  resetPassword,
  changePassword,
  profile,
};
