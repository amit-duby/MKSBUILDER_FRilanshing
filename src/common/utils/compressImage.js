const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const AppError = require('../errors/AppError');

const PRESETS = {
  avatar: { maxWidth: 512, maxHeight: 512, quality: 72, maxBytes: 150 * 1024 },
  profile: { maxWidth: 800, maxHeight: 800, quality: 72, maxBytes: 200 * 1024 },
  id: { maxWidth: 1280, maxHeight: 1280, quality: 75, maxBytes: 300 * 1024 },
};

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const SMALL_BYTES = 1024 * 1024;

function isStoredPath(value) {
  return typeof value === 'string' && value.startsWith('/uploads/');
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (!value || typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || isStoredPath(text) || text.length <= 500) return null;
  const dataUrl = text.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,([\s\S]+)$/i);
  if (dataUrl) return Buffer.from(dataUrl[1].replace(/\s/g, ''), 'base64');
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(text)) return Buffer.from(text.replace(/\s/g, ''), 'base64');
  return null;
}

function imageExtension(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return '.png';
  }
  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return '.webp';
  }
  return '.jpg';
}

async function compressToSmall(input, preset) {
  let quality = preset.quality;
  let buffer = await sharp(input, { failOn: 'truncated' })
    .rotate()
    .resize({
      width: preset.maxWidth,
      height: preset.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (buffer.length > preset.maxBytes && quality > 45) {
    quality -= 10;
    buffer = await sharp(buffer)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  return buffer;
}

async function prepareImage(input, presetName = 'profile') {
  const preset = PRESETS[presetName] || PRESETS.profile;
  if (!input || !input.length) {
    throw new AppError('Photo must be a valid JPEG, PNG, or WebP image', 400, 'BAD_REQUEST');
  }
  if (input.length > MAX_INPUT_BYTES) {
    throw new AppError('Photo must be 10 MB or smaller before compression', 400, 'BAD_REQUEST');
  }

  try {
    await sharp(input, { failOn: 'truncated' }).metadata();
  } catch {
    throw new AppError('Photo must be a valid JPEG, PNG, or WebP image', 400, 'BAD_REQUEST');
  }

  if (input.length < SMALL_BYTES) {
    return { buffer: input, ext: imageExtension(input), compressed: false };
  }

  try {
    const buffer = await compressToSmall(input, preset);
    return { buffer, ext: '.jpg', compressed: true };
  } catch {
    throw new AppError('Photo must be a valid JPEG, PNG, or WebP image', 400, 'BAD_REQUEST');
  }
}

async function compressBuffer(input, presetName = 'profile') {
  const prepared = await prepareImage(input, presetName);
  return prepared.buffer;
}

async function saveCompressedImage(value, { folder, preset } = {}) {
  const input = toBuffer(value);
  if (!input) return typeof value === 'string' ? value.trim() : value;

  const prepared = await prepareImage(input, preset || 'profile');
  const dir = path.join(process.cwd(), 'uploads', folder || 'employees');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${prepared.ext}`;
  await fs.promises.writeFile(path.join(dir, filename), prepared.buffer);
  return `/uploads/${folder || 'employees'}/${filename}`;
}

function removeStoredImage(publicPath, folder) {
  if (!publicPath || typeof publicPath !== 'string') return;
  const allowed = `/uploads/${folder}/`;
  if (!publicPath.startsWith(allowed)) return;
  const root = path.resolve(process.cwd(), 'uploads', folder);
  const file = path.resolve(process.cwd(), `.${publicPath}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  fs.promises.unlink(file).catch(() => {});
}

module.exports = {
  PRESETS,
  MAX_INPUT_BYTES,
  SMALL_BYTES,
  isStoredPath,
  toBuffer,
  prepareImage,
  compressBuffer,
  saveCompressedImage,
  removeStoredImage,
};
