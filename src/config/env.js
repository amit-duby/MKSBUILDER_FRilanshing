const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const blankToUndefined = (value) => {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
};

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('8h'),
  CORS_ORIGIN: z.string().min(1).default('*'),
  LOG_LEVEL: z.string().min(1).default('info'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  RESEND_API_KEY: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  MAIL_FROM: z.preprocess(blankToUndefined, z.string().trim().min(3).max(200).optional()),
});

let cached;

function getConfig() {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    console.error('Invalid environment configuration:\n' + details.join('\n'));
    throw new Error('Invalid environment configuration');
  }

  cached = {
    ...parsed.data,
    trustProxy: parsed.data.TRUST_PROXY === 'true',
    resend: parsed.data.RESEND_API_KEY
      ? {
          apiKey: parsed.data.RESEND_API_KEY,
          from: parsed.data.MAIL_FROM || 'MKS Construction ERP <onboarding@resend.dev>',
        }
      : null,
    corsOrigins: parsed.data.CORS_ORIGIN === '*'
      ? '*'
      : parsed.data.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean),
  };

  return cached;
}

module.exports = { getConfig };
