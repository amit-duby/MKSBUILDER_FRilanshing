const multer = require('multer');
const AppError = require('../errors/AppError');
const { saveCompressedImage } = require('../utils/compressImage');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const NUMBER_FIELDS = ['quantity', 'unitCost'];
const EMPTY_FIELDS = [
  'itemId',
  'status',
  'direction',
  'projectId',
  'siteId',
  'employeeId',
  'vehicleTypeId',
  'unitCost',
  'vendorName',
  'condition',
  'billNo',
  'challanNo',
  'materialReceiptPhoto',
  'paymentMode',
  'address',
  'movementDate',
  'reference',
  'remarks',
  'status',
];

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter(_req, file, callback) {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      callback(new AppError('Receipt photo must be JPEG, PNG, or WebP', 400, 'BAD_REQUEST'));
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function coerceMovementFields(body) {
  if (!body || typeof body !== 'object') return;

  NUMBER_FIELDS.forEach((key) => {
    if (typeof body[key] === 'string' && body[key].trim()) body[key] = Number(body[key]);
  });

  EMPTY_FIELDS.forEach((key) => {
    if (body[key] === '') delete body[key];
  });
}

function movementUpload(req, res, next) {
  upload.single('materialReceiptPhoto')(req, res, async (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Photo must be 10 MB or smaller. It will be compressed automatically.', 400, 'BAD_REQUEST'));
      }
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError('Use materialReceiptPhoto for one JPEG, PNG, or WebP photo', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Receipt photo upload failed', 400, 'BAD_REQUEST'));
    }

    req.body = req.body || {};
    coerceMovementFields(req.body);

    try {
      if (req.file && req.file.buffer) {
        req.body.materialReceiptPhoto = await saveCompressedImage(req.file.buffer, {
          folder: 'movements',
          preset: 'id',
        });
      }
      return next();
    } catch (compressError) {
      return next(compressError);
    }
  });
}

module.exports = { movementUpload };
