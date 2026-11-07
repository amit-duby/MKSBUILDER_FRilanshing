const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');

const RECEIPT_DIR = path.join(process.cwd(), 'uploads', 'local-amounts');
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
  impressamountid: 'impressAmountId',
  impressamount: 'impressAmountId',
  returnamount: 'returnAmount',
  paymentmode: 'paymentMode',
  uploadreceipt: 'uploadReceipt',
};

function fieldKey(name) {
  return String(name).trim().replace(/[\s_-]/g, '').toLowerCase();
}

function coerceLocalAmountFields(body) {
  if (!body || typeof body !== 'object') return;

  for (const key of Object.keys(body)) {
    const alias = FIELD_ALIASES[fieldKey(key)];
    if (!alias || alias === key) continue;
    if (body[alias] === undefined || body[alias] === '') {
      body[alias] = typeof body[key] === 'string' ? body[key].trim() : body[key];
    }
  }

  if (typeof body.returnAmount === 'string' && body.returnAmount.trim()) {
    body.returnAmount = Number(body.returnAmount);
  }
}

function pickReceiptFile(files) {
  if (!Array.isArray(files) || files.length === 0) return null;
  const aliases = new Set(['uploadreceipt', 'receipt', 'file', 'image', 'photo']);
  return files.find((file) => aliases.has(fieldKey(file.fieldname))) || null;
}

function localAmountUpload(req, res, next) {
  upload.any()(req, res, (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Receipt must be 5 MB or smaller', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Receipt upload failed', 400, 'BAD_REQUEST'));
    }
    const file = pickReceiptFile(req.files);
    if (file) req.body.uploadReceipt = `/uploads/local-amounts/${file.filename}`;
    coerceLocalAmountFields(req.body);
    return next();
  });
}

function removeStoredLocalReceipt(publicPath) {
  if (!publicPath) return;
  const stored = String(publicPath).replace(/^https?:\/\/[^/]+/i, '');
  if (!stored.startsWith('/uploads/local-amounts/')) return;
  const root = path.resolve(RECEIPT_DIR);
  const file = path.resolve(process.cwd(), `.${stored}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  fs.promises.unlink(file).catch(() => {});
}

module.exports = { localAmountUpload, RECEIPT_DIR, removeStoredLocalReceipt };
