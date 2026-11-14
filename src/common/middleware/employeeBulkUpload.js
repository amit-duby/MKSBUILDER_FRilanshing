const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');

const ALLOWED_EXT = new Set(['.xlsx', '.xls']);
const ALLOWED_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

const storage = multer.memoryStorage();

function fileFilter(_req, file, callback) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    callback(new AppError('Upload an Excel file (.xlsx or .xls)', 400, 'BAD_REQUEST'));
    return;
  }
  if (file.mimetype && !ALLOWED_TYPES.has(file.mimetype)) {
    // Some browsers send odd mimetypes; extension already validated.
  }
  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

function employeeBulkUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Excel file must be 5 MB or smaller', 400, 'BAD_REQUEST'));
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError('Unexpected file field. Use file', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Excel upload failed', 400, 'BAD_REQUEST'));
    }
    if (!req.file) {
      return next(new AppError('Choose an Excel file in the file field', 400, 'BAD_REQUEST'));
    }
    return next();
  });
}

module.exports = { employeeBulkUpload };
