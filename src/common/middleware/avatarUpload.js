const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');
const { compressBuffer } = require('../utils/compressImage');

const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

fs.mkdirSync(AVATAR_DIR, { recursive: true });

function fileFilter(_req, file, callback) {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    callback(new AppError('Avatar must be a JPEG, PNG, or WebP image', 400, 'BAD_REQUEST'));
    return;
  }
  callback(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function avatarUpload(req, res, next) {
  upload.single('avatar')(req, res, async (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Avatar must be 10 MB or smaller. It will be compressed automatically.', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Avatar upload failed', 400, 'BAD_REQUEST'));
    }
    if (!req.file || !req.file.buffer) return next();
    try {
      const buffer = await compressBuffer(req.file.buffer, 'avatar');
      const filename = `${req.user.id}-${Date.now()}.jpg`;
      await fs.promises.writeFile(path.join(AVATAR_DIR, filename), buffer);
      req.file.filename = filename;
      return next();
    } catch (compressError) {
      return next(compressError);
    }
  });
}

module.exports = { avatarUpload, AVATAR_DIR };
