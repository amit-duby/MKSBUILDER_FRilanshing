const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');

const IMAGE_DIR = path.join(process.cwd(), 'uploads', 'gallary');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

fs.mkdirSync(IMAGE_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: IMAGE_DIR,
  filename(_req, file, callback) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
  },
});

function fileFilter(_req, file, callback) {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    callback(new AppError('Image must be a JPEG, PNG, or WebP', 400, 'BAD_REQUEST'));
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
  imagedate: 'date',
  galleryimage: 'image',
  photo: 'image',
  file: 'image',
};

function fieldKey(name) {
  return String(name).trim().replace(/[\s_-]/g, '').toLowerCase();
}

function coerceGallaryFields(body) {
  if (!body || typeof body !== 'object') return;

  for (const key of Object.keys(body)) {
    const alias = FIELD_ALIASES[fieldKey(key)];
    if (!alias || alias === key) continue;
    if (body[alias] === undefined || body[alias] === '') {
      body[alias] = typeof body[key] === 'string' ? body[key].trim() : body[key];
    }
  }
}

function pickImageFile(files) {
  if (!Array.isArray(files) || files.length === 0) return null;
  const aliases = new Set(['image', 'photo', 'file', 'galleryimage']);
  return files.find((file) => aliases.has(fieldKey(file.fieldname))) || null;
}

function gallaryUpload(req, res, next) {
  upload.any()(req, res, (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Image must be 5 MB or smaller', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Image upload failed', 400, 'BAD_REQUEST'));
    }
    const file = pickImageFile(req.files);
    if (file) req.body.image = `/uploads/gallary/${file.filename}`;
    coerceGallaryFields(req.body);
    return next();
  });
}

function removeStoredGallaryImage(publicPath) {
  if (!publicPath) return;
  const stored = String(publicPath).replace(/^https?:\/\/[^/]+/i, '');
  if (!stored.startsWith('/uploads/gallary/')) return;
  const root = path.resolve(IMAGE_DIR);
  const file = path.resolve(process.cwd(), `.${stored}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  fs.promises.unlink(file).catch(() => {});
}

module.exports = { gallaryUpload, IMAGE_DIR, removeStoredGallaryImage };
