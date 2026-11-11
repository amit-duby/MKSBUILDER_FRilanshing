const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');

const VEHICLE_DIR = path.join(process.cwd(), 'uploads', 'vehicles');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

fs.mkdirSync(VEHICLE_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: VEHICLE_DIR,
  filename(_req, file, callback) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9).toString(16)}${safeExt}`);
  },
});

function fileFilter(_req, file, callback) {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    callback(new AppError('Vehicle photo must be JPEG, PNG, or WebP', 400, 'BAD_REQUEST'));
    return;
  }
  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const FIELD_ALIASES = {
  registrationnumber: 'registrationNumber',
  vehicletypeid: 'vehicleTypeId',
  modelname: 'modelName',
  fueltype: 'fuelType',
  vehiclephoto: 'vehiclePhoto',
};

function fieldKey(name) {
  return String(name).trim().replace(/[\s_-]/g, '').toLowerCase();
}

function coerceNumber(body, key) {
  if (typeof body[key] === 'string' && body[key].trim()) {
    const next = Number(body[key]);
    if (Number.isFinite(next)) body[key] = next;
  }
}

function parseJsonMaybe(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function coerceVehicleFields(body) {
  if (!body || typeof body !== 'object') return;

  for (const key of Object.keys(body)) {
    const alias = FIELD_ALIASES[fieldKey(key)];
    if (!alias || alias === key) continue;
    if (body[alias] === undefined || body[alias] === '') {
      body[alias] = typeof body[key] === 'string' ? body[key].trim() : body[key];
    }
  }

  coerceNumber(body, 'year');
  coerceNumber(body, 'odometer');
  if (body.documents !== undefined) body.documents = parseJsonMaybe(body.documents);
}

function publicPath(file) {
  return `/uploads/vehicles/${file.filename}`;
}

function vehicleUpload(req, res, next) {
  upload.single('vehiclePhoto')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Vehicle photo must be 5 MB or smaller', 400, 'BAD_REQUEST'));
      }
      return next(new AppError(error.message, 400, 'BAD_REQUEST'));
    }
    if (error) return next(error);

    req.body = req.body || {};
    coerceVehicleFields(req.body);

    if (req.file) {
      req.body.vehiclePhoto = publicPath(req.file);
    }

    return next();
  });
}

function removeStoredVehiclePhoto(publicPathValue) {
  if (!publicPathValue) return;
  const stored = String(publicPathValue).replace(/^https?:\/\/[^/]+/i, '');
  if (!stored.startsWith('/uploads/vehicles/')) return;
  const root = path.resolve(VEHICLE_DIR);
  const file = path.resolve(process.cwd(), `.${stored}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  fs.promises.unlink(file).catch(() => {});
}

module.exports = { vehicleUpload, VEHICLE_DIR, removeStoredVehiclePhoto };
