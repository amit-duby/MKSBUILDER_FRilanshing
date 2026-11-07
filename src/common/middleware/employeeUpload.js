const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../errors/AppError');

const EMPLOYEE_DIR = path.join(process.cwd(), 'uploads', 'employees');
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

fs.mkdirSync(EMPLOYEE_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: EMPLOYEE_DIR,
  filename(_req, file, callback) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9).toString(16)}${safeExt}`);
  },
});

function fileFilter(_req, file, callback) {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    callback(new AppError('Employee photos must be JPEG, PNG, or WebP', 400, 'BAD_REQUEST'));
    return;
  }
  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 7 },
});

const FIELD_ALIASES = {
  fullname: 'fullName',
  departmentid: 'departmentId',
  employmenttype: 'employmentType',
  joiningdate: 'joiningDate',
  relievingdate: 'relievingDate',
  siteid: 'siteId',
  idtype: 'idType',
  idnumber: 'idNumber',
  bankname: 'bankName',
  accountnumber: 'accountNumber',
  ifsccode: 'ifscCode',
  profilephoto: 'profilePhoto',
  idphotos: 'idPhotos',
  baseamount: 'baseAmount',
  paybasis: 'payBasis',
};

function fieldKey(name) {
  return String(name).trim().replace(/[\s_-]/g, '').toLowerCase();
}

function setNested(target, pathParts, value) {
  let cursor = target;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    const part = pathParts[i];
    if (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  cursor[pathParts[pathParts.length - 1]] = value;
}

function expandBracketKeys(body) {
  for (const key of Object.keys(body)) {
    if (!key.includes('[') && !key.includes('.')) continue;
    const normalized = key.replace(/\]/g, '').replace(/\[/g, '.');
    const parts = normalized.split('.').filter(Boolean);
    if (parts.length < 2) continue;
    setNested(body, parts, body[key]);
    delete body[key];
  }
}

function applyAliases(body) {
  for (const key of Object.keys(body)) {
    const alias = FIELD_ALIASES[fieldKey(key)];
    if (!alias || alias === key) continue;
    if (body[alias] === undefined || body[alias] === '') {
      body[alias] = typeof body[key] === 'string' ? body[key].trim() : body[key];
    }
  }
}

function coerceNumber(value) {
  if (typeof value !== 'string' || !value.trim()) return value;
  const next = Number(value);
  return Number.isFinite(next) ? next : value;
}

function parseJsonMaybe(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function coerceEmployeeFields(body) {
  if (!body || typeof body !== 'object') return;

  expandBracketKeys(body);
  applyAliases(body);

  if (body.salary && typeof body.salary === 'string') {
    body.salary = parseJsonMaybe(body.salary);
  }
  if (!body.salary || typeof body.salary !== 'object' || Array.isArray(body.salary)) {
    body.salary = {};
  }

  if (body.baseAmount !== undefined && body.salary.baseAmount === undefined) {
    body.salary.baseAmount = body.baseAmount;
  }
  if (body.payBasis !== undefined && body.salary.payBasis === undefined) {
    body.salary.payBasis = body.payBasis;
  }
  if (body.allowances !== undefined && body.salary.allowances === undefined) {
    body.salary.allowances = body.allowances;
  }

  body.salary.baseAmount = coerceNumber(body.salary.baseAmount);
  if (typeof body.salary.allowances === 'string') {
    body.salary.allowances = parseJsonMaybe(body.salary.allowances);
  }
  if (Array.isArray(body.salary.allowances)) {
    body.salary.allowances = body.salary.allowances.map((line) => {
      if (!line || typeof line !== 'object') return line;
      return {
        ...line,
        amount: coerceNumber(line.amount),
      };
    });
  }

  if (typeof body.idPhotos === 'string') {
    const parsed = parseJsonMaybe(body.idPhotos);
    body.idPhotos = Array.isArray(parsed) ? parsed : [body.idPhotos];
  }
}

function publicPath(file) {
  return `/uploads/employees/${file.filename}`;
}

function employeeUpload(req, res, next) {
  const contentType = String(req.headers['content-type'] || '');
  // JSON create/update: skip multer entirely (saves parse overhead)
  if (!contentType.includes('multipart/form-data')) {
    req.body = req.body || {};
    coerceEmployeeFields(req.body);
    return next();
  }

  upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'idPhotos', maxCount: 6 },
    { name: 'idPhoto', maxCount: 2 },
  ])(req, res, (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Employee photo must be 5 MB or smaller', 400, 'BAD_REQUEST'));
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError('Unexpected file field. Use profilePhoto or idPhotos', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Employee upload failed', 400, 'BAD_REQUEST'));
    }

    req.body = req.body || {};
    coerceEmployeeFields(req.body);

    const files = req.files || {};
    if (files.profilePhoto && files.profilePhoto[0]) {
      req.body.profilePhoto = publicPath(files.profilePhoto[0]);
    }

    const idFiles = []
      .concat(files.idPhotos || [])
      .concat(files.idPhoto || []);
    if (idFiles.length) {
      req.body.idPhotos = idFiles.map(publicPath);
    }

    return next();
  });
}

function removeStoredEmployeePhoto(publicPathValue) {
  if (!publicPathValue) return;
  const stored = String(publicPathValue).replace(/^https?:\/\/[^/]+/i, '');
  if (!stored.startsWith('/uploads/employees/')) return;
  const root = path.resolve(EMPLOYEE_DIR);
  const file = path.resolve(process.cwd(), `.${stored}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  fs.promises.unlink(file).catch(() => {});
}

module.exports = { employeeUpload, EMPLOYEE_DIR, removeStoredEmployeePhoto };
