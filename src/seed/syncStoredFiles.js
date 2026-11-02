const fs = require('fs');
const path = require('path');
const logger = require('../common/utils/logger');
const StoredFile = require('../modules/uploads/storedFile.model');

const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');

function mimeFromExt(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

async function syncStoredFiles() {
  const files = walk(UPLOAD_ROOT);
  if (!files.length) return 0;

  let saved = 0;
  for (const abs of files) {
    const relative = path.relative(UPLOAD_ROOT, abs).replace(/\\/g, '/');
    const key = `/uploads/${relative}`;
    const exists = await StoredFile.exists({ key });
    if (exists) continue;
    const data = await fs.promises.readFile(abs);
    await StoredFile.create({
      key,
      mime: mimeFromExt(path.extname(abs).toLowerCase()),
      data,
    });
    saved += 1;
  }

  if (saved) logger.info({ saved }, 'Employee photos synced to the database');
  return saved;
}

module.exports = { syncStoredFiles };
