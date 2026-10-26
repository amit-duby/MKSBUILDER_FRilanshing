const {
  z,
  requestSchema,
  shortText,
} = require('../../common/validators/zod');

const credentials = {
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
};

const register = requestSchema({
  body: z.object({
    name: shortText(120),
    ...credentials,
  }),
});

const login = requestSchema({
  body: z.object(credentials),
});

const forgotPassword = requestSchema({
  body: z.object({
    email: z.string().trim().email(),
  }),
});

const resetPassword = requestSchema({
  body: z.object({
    token: z.string().trim().min(32).max(256),
    newPassword: z.string().min(8).max(128),
  }),
});

const changePassword = requestSchema({
  body: z.object({
    currentPassword: z.string().min(8).max(128),
    newPassword: z.string().min(8).max(128),
  }),
});

const profile = requestSchema({
  body: z.object({
    name: shortText(120),
  }),
});

module.exports = { register, login, forgotPassword, resetPassword, changePassword, profile };
