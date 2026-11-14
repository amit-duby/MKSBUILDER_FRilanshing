const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');

const COMPANY_DIR = path.join(process.cwd(), 'uploads', 'companies');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

fs.mkdirSync(COMPANY_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: COMPANY_DIR,
  filename(_req, file, callback) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9).toString(16)}${safeExt}`);
  },
});

function fileFilter(_req, file, callback) {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    callback(new AppError('Company logo must be JPEG, PNG, or WebP', 400, 'BAD_REQUEST'));
    return;
  }
  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

function parseJsonField(body, key) {
  if (!body || body[key] == null) return;
  if (typeof body[key] !== 'string') return;
  const trimmed = body[key].trim();
  if (!trimmed) return;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return;
  try {
    body[key] = JSON.parse(trimmed);
  } catch {
    // keep original string; validation will fail clearly
  }
}

function coerceCompanyBody(body) {
  if (!body || typeof body !== 'object') return;
  parseJsonField(body, 'contact');
  parseJsonField(body, 'registration');
  parseJsonField(body, 'registeredAddress');
  parseJsonField(body, 'officeAddress');
  parseJsonField(body, 'bankDetails');
  if (typeof body.establishedYear === 'string' && body.establishedYear.trim()) {
    const year = Number(body.establishedYear);
    if (Number.isFinite(year)) body.establishedYear = year;
  }
}

function companyUpload(req, res, next) {
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('multipart/form-data')) {
    req.body = req.body || {};
    coerceCompanyBody(req.body);
    return next();
  }

  upload.single('logo')(req, res, (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Company logo must be 2 MB or smaller', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Company logo upload failed', 400, 'BAD_REQUEST'));
    }

    req.body = req.body || {};
    coerceCompanyBody(req.body);
    if (req.file) {
      req.body.logo = `/uploads/companies/${req.file.filename}`;
    }
    return next();
  });
}

function removeStoredCompanyLogo(publicPathValue) {
  if (!publicPathValue) return;
  const stored = String(publicPathValue).replace(/^https?:\/\/[^/]+/i, '');
  if (!stored.startsWith('/uploads/companies/')) return;
  const root = path.resolve(COMPANY_DIR);
  const file = path.resolve(process.cwd(), `.${stored}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  fs.promises.unlink(file).catch(() => {});
}

module.exports = { companyUpload, removeStoredCompanyLogo, COMPANY_DIR };
