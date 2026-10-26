const rateLimit = require('express-rate-limit');

function buildLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message,
      code: 'RATE_LIMITED',
    },
  });
}

const apiLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests. Try again later.',
});

const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts. Try again later.',
});

module.exports = { apiLimiter, loginLimiter };
