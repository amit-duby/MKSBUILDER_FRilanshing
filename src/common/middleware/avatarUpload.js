const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');

const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

fs.mkdirSync(AVATAR_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: AVATAR_DIR,
  filename(req, file, callback) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
    callback(null, `${req.user.id}-${Date.now()}${safeExt}`);
  },
});

function fileFilter(_req, file, callback) {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    callback(new AppError('Avatar must be a JPEG, PNG, or WebP image', 400, 'BAD_REQUEST'));
    return;
  }
  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

function avatarUpload(req, res, next) {
  upload.single('avatar')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof AppError) return next(error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('Avatar must be 2 MB or smaller', 400, 'BAD_REQUEST'));
    }
    return next(new AppError('Avatar upload failed', 400, 'BAD_REQUEST'));
  });
}

module.exports = { avatarUpload, AVATAR_DIR };
