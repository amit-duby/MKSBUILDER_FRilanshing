const path = require('path');
const multer = require('multer');
const AppError = require('../../common/errors/AppError');

const ALLOWED_EXT = new Set(['.xlsx', '.xls']);
const ALLOWED_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter(_req, file, callback) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext) && !ALLOWED_TYPES.has(file.mimetype)) {
      callback(new AppError('Upload an Excel file (.xlsx)', 400, 'BAD_REQUEST'));
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

function excelUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Excel file must be 5 MB or smaller', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Excel upload failed', 400, 'BAD_REQUEST'));
    }
    if (!req.file || !req.file.buffer) {
      return next(new AppError('Choose an Excel file in the file field', 400, 'BAD_REQUEST'));
    }
    return next();
  });
}

module.exports = { excelUpload };
