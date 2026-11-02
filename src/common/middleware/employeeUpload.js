const multer = require('multer');
const AppError = require('../errors/AppError');
const { saveCompressedImage } = require('../utils/compressImage');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ID_PHOTOS = 2;

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter(_req, file, callback) {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      callback(new AppError('Photos must be JPEG, PNG, or WebP', 400, 'BAD_REQUEST'));
      return;
    }
    callback(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 3 },
});

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return undefined;
  if (
    (text.startsWith('{') && text.endsWith('}'))
    || (text.startsWith('[') && text.endsWith(']'))
  ) {
    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  }
  return value;
}

function emptyToUndefined(value) {
  if (value === '' || value === undefined) return undefined;
  return value;
}

function isIdPhotoField(name) {
  return /^(idPhotos?|id_photos?)(\[\d*\])?$/i.test(String(name || ''));
}

function isProfileField(name) {
  return /^(profilePhoto|profile_photo)(\[\d*\])?$/i.test(String(name || ''));
}

function asPhotoList(value) {
  if (value == null || value === '') return [];
  const parsed = typeof value === 'string' ? parseMaybeJson(value) : value;
  if (Array.isArray(parsed)) return parsed.filter(Boolean);
  if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()];
  return [];
}

function coerceEmployeeFields(body) {
  if (!body || typeof body !== 'object') return;

  const salaryBits = {};
  if (body['salary.baseAmount'] != null) salaryBits.baseAmount = body['salary.baseAmount'];
  if (body['salary.payBasis'] != null) salaryBits.payBasis = body['salary.payBasis'];
  if (body['salary.allowances'] != null) salaryBits.allowances = body['salary.allowances'];
  for (const [key, value] of Object.entries(body)) {
    const match = key.match(/^salary\[(\w+)\]$/);
    if (match) salaryBits[match[1]] = value;
  }

  if (typeof body.salary === 'string') body.salary = parseMaybeJson(body.salary);
  if (!body.salary || typeof body.salary !== 'object' || Array.isArray(body.salary)) {
    if (Object.keys(salaryBits).length) body.salary = salaryBits;
    else if (body.baseAmount != null || body.payBasis != null) {
      body.salary = {
        baseAmount: body.baseAmount,
        payBasis: body.payBasis,
        allowances: parseMaybeJson(body.allowances),
      };
      delete body.baseAmount;
      delete body.payBasis;
      delete body.allowances;
    }
  } else {
    Object.assign(body.salary, salaryBits);
  }

  if (body.salary && typeof body.salary === 'object') {
    if (typeof body.salary.baseAmount === 'string' && body.salary.baseAmount.trim()) {
      body.salary.baseAmount = Number(body.salary.baseAmount);
    }
    if (typeof body.salary.allowances === 'string') {
      body.salary.allowances = parseMaybeJson(body.salary.allowances);
    }
  }

  const photos = asPhotoList(body.idPhotos);
  if (photos.length) body.idPhotos = photos;
  else delete body.idPhotos;

  [
    'siteId', 'email', 'phone', 'notes', 'address', 'profilePhoto',
    'relievingDate', 'idType', 'idNumber', 'bankName', 'accountNumber', 'ifscCode',
  ].forEach((key) => {
    if (body[key] === '') delete body[key];
  });

  if (body.email) body.email = emptyToUndefined(body.email);
}

function employeeUpload(req, res, next) {
  upload.any()(req, res, async (error) => {
    if (error) {
      if (error instanceof AppError) return next(error);
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Each photo must be 10 MB or smaller. It will be compressed automatically.', 400, 'BAD_REQUEST'));
      }
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError('Use profilePhoto for one photo and idPhotos for 1 or 2 ID photos', 400, 'BAD_REQUEST'));
      }
      return next(new AppError('Employee photo upload failed', 400, 'BAD_REQUEST'));
    }

    req.body = req.body || {};
    coerceEmployeeFields(req.body);

    const files = Array.isArray(req.files) ? req.files : [];
    const unexpected = files.find((file) => !isIdPhotoField(file.fieldname) && !isProfileField(file.fieldname));
    if (unexpected) {
      return next(new AppError('Use profilePhoto for one photo and idPhotos for 1 or 2 ID photos', 400, 'BAD_REQUEST'));
    }

    const profileFiles = files.filter((file) => isProfileField(file.fieldname));
    const idFiles = files.filter((file) => isIdPhotoField(file.fieldname));
    if (profileFiles.length > 1) {
      return next(new AppError('Use profilePhoto for one photo', 400, 'BAD_REQUEST'));
    }
    if (idFiles.length > MAX_ID_PHOTOS) {
      return next(new AppError('You can upload 1 or 2 ID photos', 400, 'BAD_REQUEST'));
    }

    try {
      if (profileFiles[0]) {
        req.body.profilePhoto = await saveCompressedImage(profileFiles[0].buffer, {
          folder: 'employees',
          preset: 'profile',
        });
      }
      if (idFiles.length) {
        const saved = await Promise.all(idFiles.map((file) => saveCompressedImage(file.buffer, {
          folder: 'employees',
          preset: 'id',
        })));
        req.body.idPhotos = asPhotoList(req.body.idPhotos).concat(saved);
      }
      if (Array.isArray(req.body.idPhotos) && req.body.idPhotos.length > MAX_ID_PHOTOS) {
        return next(new AppError('You can upload 1 or 2 ID photos', 400, 'BAD_REQUEST'));
      }
      return next();
    } catch (compressError) {
      return next(compressError);
    }
  });
}

module.exports = { employeeUpload };
