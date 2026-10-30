const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');

const ADVANCE_DIR = path.join(process.cwd(), 'uploads', 'advances');
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

fs.mkdirSync(ADVANCE_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: ADVANCE_DIR,
  filename(_req, file, callback) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.pdf';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
  },
});

function fileFilter(_req, file, callback) {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    callback(new AppError('Attachment must be a JPEG, PNG, WebP, or PDF', 400, 'BAD_REQUEST'));
    return;
  }
  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

function coerceAdvanceFields(body) {
  if (typeof body.advanceAmount === 'string' && body.advanceAmount.trim()) {
    body.advanceAmount = Number(body.advanceAmount);
  }
  if (typeof body.monthlySalary === 'string' && body.monthlySalary.trim()) {
    body.monthlySalary = Number(body.monthlySalary);
  }
}

function advanceUpload(req, res, next) {
  upload.single('attachment')(req, res, (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Attachment must be 5 MB or smaller', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Attachment upload failed', 400, 'BAD_REQUEST'));
    }
    if (req.file) req.body.attachment = `/uploads/advances/${req.file.filename}`;
    coerceAdvanceFields(req.body);
    return next();
  });
}

module.exports = { advanceUpload, ADVANCE_DIR };
