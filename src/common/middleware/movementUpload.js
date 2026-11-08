const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');

const RECEIPT_DIR = path.join(process.cwd(), 'uploads', 'inventory');
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

fs.mkdirSync(RECEIPT_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: RECEIPT_DIR,
  filename(_req, file, callback) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.pdf';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
  },
});

function fileFilter(_req, file, callback) {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    callback(new AppError('Receipt must be a JPEG, PNG, WebP, or PDF', 400, 'BAD_REQUEST'));
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
  itemid: 'itemId',
  fromlocation: 'fromLocation',
  tolocation: 'toLocation',
  locationtype: 'locationType',
  siteid: 'siteId',
  employeeid: 'employeeId',
  vehicletypeid: 'vehicleTypeId',
  vehicletype: 'vehicleTypeId',
  unitcost: 'unitCost',
  vendorname: 'vendorName',
  billno: 'billNo',
  challanno: 'challanNo',
  materialreceiptphoto: 'materialReceiptPhoto',
  paymentmode: 'paymentMode',
  movementdate: 'movementDate',
};

function fieldKey(name) {
  return String(name).trim().replace(/[\s_-]/g, '').toLowerCase();
}

function unwrapValue(value) {
  if (!Array.isArray(value)) return value;
  for (const item of value) {
    if (item === undefined || item === null) continue;
    const text = typeof item === 'string' ? item.trim() : item;
    if (text !== '') return text;
  }
  return '';
}

function coerceNumber(body, key) {
  body[key] = unwrapValue(body[key]);
  if (typeof body[key] === 'string' && body[key].trim()) {
    body[key] = Number(body[key]);
  }
}

function coerceString(body, key) {
  body[key] = unwrapValue(body[key]);
  if (typeof body[key] === 'string') body[key] = body[key].trim();
}

function coerceMovementFields(body) {
  if (!body || typeof body !== 'object') return;

  for (const key of Object.keys(body)) {
    body[key] = unwrapValue(body[key]);
    const alias = FIELD_ALIASES[fieldKey(key)];
    if (!alias || alias === key) continue;
    if (body[alias] === undefined || body[alias] === '') {
      body[alias] = typeof body[key] === 'string' ? body[key].trim() : body[key];
    }
  }

  coerceNumber(body, 'quantity');
  coerceNumber(body, 'unitCost');

  for (const key of [
    'type',
    'itemId',
    'fromLocation',
    'toLocation',
    'locationType',
    'siteId',
    'employeeId',
    'vehicleTypeId',
    'vendorName',
    'condition',
    'billNo',
    'challanNo',
    'paymentMode',
    'movementDate',
    'address',
    'reference',
    'remarks',
    'note',
    'materialReceiptPhoto',
  ]) {
    if (body[key] !== undefined) coerceString(body, key);
  }
}

function movementUpload(req, res, next) {
  upload.single('materialReceiptPhoto')(req, res, (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Receipt must be 5 MB or smaller', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Receipt upload failed', 400, 'BAD_REQUEST'));
    }
    if (!req.body || typeof req.body !== 'object') req.body = {};
    if (req.file) req.body.materialReceiptPhoto = `/uploads/inventory/${req.file.filename}`;
    coerceMovementFields(req.body);
    return next();
  });
}

function removeStoredReceipt(publicPath) {
  if (!publicPath) return;
  const stored = String(publicPath).replace(/^https?:\/\/[^/]+/i, '');
  if (!stored.startsWith('/uploads/inventory/')) return;
  const root = path.resolve(RECEIPT_DIR);
  const file = path.resolve(process.cwd(), `.${stored}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  fs.promises.unlink(file).catch(() => {});
}

module.exports = { movementUpload, RECEIPT_DIR, removeStoredReceipt };
