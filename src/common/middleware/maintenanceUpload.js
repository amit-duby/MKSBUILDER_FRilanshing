const multer = require('multer');
const AppError = require('../errors/AppError');
const { saveCompressedImage } = require('../utils/compressImage');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter(_req, file, callback) {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      callback(new AppError('Maintenance photo must be JPEG, PNG, or WebP', 400, 'BAD_REQUEST'));
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function coerceMaintenanceFields(body) {
  if (!body || typeof body !== 'object') return;

  if (body.categoryId && !body.category) body.category = body.categoryId;
  if (typeof body.amount === 'string' && body.amount.trim()) body.amount = Number(body.amount);
  ['paidTo', 'amountType', 'date', 'referenceNo', 'completedAt', 'singleImage'].forEach((key) => {
    if (body[key] === '') delete body[key];
  });
}

function maintenanceUpload(req, res, next) {
  upload.single('singleImage')(req, res, async (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Photo must be 10 MB or smaller. It will be compressed automatically.', 400, 'BAD_REQUEST'));
      }
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError('Use singleImage for one JPEG, PNG, or WebP photo', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Maintenance photo upload failed', 400, 'BAD_REQUEST'));
    }

    req.body = req.body || {};
    coerceMaintenanceFields(req.body);

    try {
      if (req.file && req.file.buffer) {
        req.body.singleImage = await saveCompressedImage(req.file.buffer, {
          folder: 'maintenance',
          preset: 'id',
        });
      }
      return next();
    } catch (compressError) {
      return next(compressError);
    }
  });
}

module.exports = { maintenanceUpload };
