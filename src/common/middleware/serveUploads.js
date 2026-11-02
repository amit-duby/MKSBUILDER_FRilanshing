const fs = require('fs');
const path = require('path');
const StoredFile = require('../../modules/uploads/storedFile.model');

const UPLOAD_ROOT = path.resolve(__dirname, '..', '..', '..', 'uploads');

function mimeFromExt(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function cleanRelativePath(req) {
  return decodeURIComponent(String(req.path || ''))
    .replace(/[\r\n]/g, '')
    .replace(/^\/+/, '')
    .trim();
}

function photoNotFound(req, res) {
  return res.status(404).json({
    success: false,
    message: 'Photo not found',
    code: 'NOT_FOUND',
    requestId: req.id,
  });
}

function sendBuffer(res, buffer, mime) {
  res.setHeader('Content-Type', mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.send(buffer);
}

async function serveUploads(req, res, next) {
  try {
    const relative = cleanRelativePath(req);
    if (!relative || relative.includes('..')) return photoNotFound(req, res);

    const abs = path.resolve(UPLOAD_ROOT, relative);
    if (!abs.startsWith(UPLOAD_ROOT)) return photoNotFound(req, res);

    const key = `/uploads/${relative.replace(/\\/g, '/')}`;

    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const buffer = await fs.promises.readFile(abs);
      StoredFile.findOneAndUpdate(
        { key },
        { key, mime: mimeFromExt(path.extname(abs).toLowerCase()), data: buffer },
        { upsert: true }
      ).catch(() => {});
      return sendBuffer(res, buffer, mimeFromExt(path.extname(abs).toLowerCase()));
    }

    const stored = await StoredFile.findOne({ key }).select('+data');
    if (!stored || !stored.data) return photoNotFound(req, res);

    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.promises.writeFile(abs, stored.data).catch(() => {});
    return sendBuffer(res, stored.data, stored.mime);
  } catch (error) {
    return next(error);
  }
}

module.exports = { serveUploads, UPLOAD_ROOT };
