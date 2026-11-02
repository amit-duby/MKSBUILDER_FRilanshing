function requestOrigin(req) {
  if (!req) return '';
  const proto = (req.get && req.get('x-forwarded-proto')) || req.protocol || 'http';
  const host = (req.get && req.get('host')) || '';
  if (!host) return '';
  return `${String(proto).split(',')[0].trim()}://${host}`;
}

function publicFileUrl(req, storedPath) {
  if (!storedPath) return storedPath;
  const cleaned = String(storedPath).replace(/[\r\n]/g, '').trim();
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  const origin = requestOrigin(req);
  const pathValue = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  return origin ? `${origin}${pathValue}` : pathValue;
}

function toPublicJson(doc) {
  if (doc == null) return doc;
  if (typeof doc.toJSON === 'function') return doc.toJSON();
  if (typeof doc !== 'object' || doc instanceof Date) return doc;
  const json = { ...doc };
  if (json._id && !json.id) json.id = String(json._id);
  delete json._id;
  delete json.__v;
  if (json.department && typeof json.department === 'object') json.department = toPublicJson(json.department);
  if (json.site && typeof json.site === 'object') json.site = toPublicJson(json.site);
  if (json.category && typeof json.category === 'object') json.category = toPublicJson(json.category);
  return json;
}

function withEmployeePhotos(req, employee) {
  if (!employee || typeof employee !== 'object') return employee;
  const json = toPublicJson(employee);
  return {
    ...json,
    profilePhoto: publicFileUrl(req, json.profilePhoto),
    idPhotos: Array.isArray(json.idPhotos)
      ? json.idPhotos.map((photo) => publicFileUrl(req, photo))
      : json.idPhotos,
  };
}

function withEmployeePhotoList(req, items) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => withEmployeePhotos(req, item));
}

function withMaintenanceImages(req, log) {
  if (!log || typeof log !== 'object') return log;
  const json = toPublicJson(log);
  return {
    ...json,
    singleImage: publicFileUrl(req, json.singleImage),
  };
}

function withMaintenanceImageList(req, items) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => withMaintenanceImages(req, item));
}

function withMovementPhoto(req, movement) {
  if (!movement || typeof movement !== 'object') return movement;
  const json = toPublicJson(movement);
  return {
    ...json,
    materialReceiptPhoto: publicFileUrl(req, json.materialReceiptPhoto),
  };
}

function withMovementPhotoList(req, items) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => withMovementPhoto(req, item));
}

module.exports = {
  requestOrigin,
  publicFileUrl,
  withEmployeePhotos,
  withEmployeePhotoList,
  withMaintenanceImages,
  withMaintenanceImageList,
  withMovementPhoto,
  withMovementPhotoList,
};
