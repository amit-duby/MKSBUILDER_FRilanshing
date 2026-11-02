const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getConfig } = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const RefreshToken = require('./refreshToken.model');
const User = require('./user.model');

const UNIT_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function parseDuration(value, fallbackMs) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const match = String(value || '').trim().match(/^(\d+)\s*([smhd])$/i);
  if (!match) return fallbackMs;
  return Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function accessExpiresIn() {
  return getConfig().JWT_EXPIRES_IN;
}

function refreshExpiresIn() {
  return getConfig().JWT_REFRESH_EXPIRES_IN;
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, tv: user.tokenVersion, email: user.email, typ: 'access' },
    getConfig().JWT_SECRET,
    { expiresIn: accessExpiresIn() }
  );
}

function newFamilyId() {
  return crypto.randomBytes(16).toString('hex');
}

async function createRefreshToken(userId, familyId) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + parseDuration(refreshExpiresIn(), 7 * UNIT_MS.d));
  const family = familyId || newFamilyId();
  await RefreshToken.create({
    user: userId,
    familyId: family,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt, familyId: family };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar || null,
  };
}

async function issueSession(user) {
  const accessToken = signAccessToken(user);
  const refresh = await createRefreshToken(user.id);
  return {
    token: accessToken,
    accessToken,
    refreshToken: refresh.token,
    expiresIn: accessExpiresIn(),
    refreshExpiresIn: refreshExpiresIn(),
    refreshExpiresAt: refresh.expiresAt,
    user: publicUser(user),
  };
}

async function revokeUserRefreshTokens(userId) {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

async function revokeFamily(familyId) {
  if (!familyId) return;
  await RefreshToken.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

async function rotateRefreshToken(rawToken) {
  const tokenHash = hashToken(String(rawToken || ''));
  const now = new Date();
  const record = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
    { new: false }
  ).select('+tokenHash +replacedByHash');

  if (record) {
    const next = await createRefreshToken(record.user, record.familyId || newFamilyId());
    await RefreshToken.updateOne(
      { _id: record._id },
      { $set: { replacedByHash: hashToken(next.token) } }
    );
    return { userId: record.user, refresh: next };
  }

  const existing = await RefreshToken.findOne({ tokenHash }).select('+tokenHash');
  if (existing && existing.revokedAt) {
    await Promise.all([
      revokeFamily(existing.familyId),
      revokeUserRefreshTokens(existing.user),
      User.updateOne({ _id: existing.user }, { $inc: { tokenVersion: 1 } }),
    ]);
    throw new AppError('Refresh token is no longer valid', 401, 'UNAUTHORIZED');
  }

  if (existing && existing.expiresAt.getTime() <= Date.now()) {
    existing.revokedAt = now;
    await existing.save();
  }

  throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
}

module.exports = {
  parseDuration,
  hashToken,
  signAccessToken,
  createRefreshToken,
  issueSession,
  rotateRefreshToken,
  revokeUserRefreshTokens,
  publicUser,
};
