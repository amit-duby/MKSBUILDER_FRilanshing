function publicBase(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function prefixUploadUrls(value, base, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return value.startsWith('/uploads/') ? `${base}${value}` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => prefixUploadUrls(item, base, seen));
  }
  // Mongoose docs are not plain objects; convert so /uploads paths get absolutized.
  if (
    value
    && typeof value === 'object'
    && typeof value.toJSON === 'function'
    && !isPlainObject(value)
    && !(value instanceof Date)
  ) {
    return prefixUploadUrls(value.toJSON(), base, seen);
  }
  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = prefixUploadUrls(item, base, seen);
  }
  return out;
}

function publicUploads(req, res, next) {
  const sendJson = res.json.bind(res);
  res.json = (payload) => sendJson(prefixUploadUrls(payload, publicBase(req)));
  next();
}

module.exports = publicUploads;
