const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');

const RECEIPT_DIR = path.join(process.cwd(), 'uploads', 'local-expenses');
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

function coerceNumbers(body) {
  if (typeof body.cashGiven === 'string' && body.cashGiven.trim()) {
    body.cashGiven = Number(body.cashGiven);
  }
  if (typeof body.returnAmount === 'string' && body.returnAmount.trim()) {
    body.returnAmount = Number(body.returnAmount);
  }
}

function localExpenseUpload(req, res, next) {
  upload.single('receipt')(req, res, (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Receipt must be 5 MB or smaller', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Receipt upload failed', 400, 'BAD_REQUEST'));
    }
    if (req.file) req.body.receipt = `/uploads/local-expenses/${req.file.filename}`;
    coerceNumbers(req.body);
    return next();
  });
}

module.exports = { localExpenseUpload, RECEIPT_DIR };
