const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function sanitizeInPlace(value) {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach(sanitizeInPlace);
    return;
  }

  for (const key of Object.keys(value)) {
    if (BLOCKED_KEYS.has(key) || key.includes('$') || key.includes('.')) {
      delete value[key];
      continue;
    }
    sanitizeInPlace(value[key]);
  }
}

function sanitize(req, _res, next) {
  sanitizeInPlace(req.body);
  sanitizeInPlace(req.params);
  if (req.query && typeof req.query === 'object') {
    sanitizeInPlace(req.query);
  }
  next();
}

module.exports = sanitize;
