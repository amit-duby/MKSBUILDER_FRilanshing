const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Native bcrypt is much faster than bcryptjs for the same cost factor.
let bcrypt;
try {
  bcrypt = require('bcrypt');
} catch {
  bcrypt = require('bcryptjs');
}
const jwt = require('jsonwebtoken');
const { getConfig } = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const { sendMail } = require('../../common/mail/mailer');
const User = require('./user.model');
const { setAuthUser, invalidateAuthUser } = require('../../common/utils/authUserCache');

const BCRYPT_ROUNDS = 8;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const LOGIN_SELECT = '+passwordHash +tokenVersion name email phone role avatar isActive';
const REFRESH_SELECT = '+tokenVersion +refreshToken +refreshTokenExpiresAt name email phone role avatar isActive';

function schedulePasswordRehash(userId, password, currentHash) {
  let rounds;
  try {
    rounds = bcrypt.getRounds(currentHash);
  } catch {
    return;
  }
  if (rounds <= BCRYPT_ROUNDS) return;
  setImmediate(() => {
    bcrypt.hash(password, BCRYPT_ROUNDS)
      .then((passwordHash) => User.updateOne({ _id: userId }, { $set: { passwordHash } }))
      .catch(() => {});
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashResetToken(token) {
  return hashToken(token);
}

function signToken(user) {
  const config = getConfig();
  return jwt.sign(
    {
      sub: user.id,
      tv: user.tokenVersion,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

function signRefreshToken(user) {
  const config = getConfig();
  return jwt.sign(
    {
      sub: user.id,
      tv: user.tokenVersion,
      type: 'refresh',
    },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRES_IN }
  );
}

function refreshExpiresAt(refreshToken) {
  const decoded = jwt.decode(refreshToken);
  if (!decoded?.exp) return null;
  return new Date(decoded.exp * 1000);
}

async function persistRefreshToken(userId, refreshToken) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        refreshToken: hashToken(refreshToken),
        refreshTokenExpiresAt: refreshExpiresAt(refreshToken),
      },
    }
  );
}

async function clearRefreshToken(userId) {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    }
  );
}

async function issueSession(user) {
  const token = signToken(user);
  const refreshToken = signRefreshToken(user);
  await persistRefreshToken(user.id, refreshToken);
  return {
    token,
    refreshToken,
    user: publicUser(user),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    avatar: user.avatar || null,
  };
}

function removeStoredAvatar(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/avatars/')) return;
  const root = path.resolve(process.cwd(), 'uploads', 'avatars');
  const file = path.resolve(process.cwd(), `.${publicPath}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  fs.promises.unlink(file).catch(() => { });
}

function assertAdmin(user) {
  if (!user || user.role !== 'admin') {
    throw new AppError('Only an admin can access this ERP', 403, 'FORBIDDEN');
  }
}

async function register(body, actor) {
  const email = body.email.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError('This email is already in use', 409, 'CONFLICT');
  }

  // const existingCount = await User.countDocuments();
  // if (existingCount > 0 && (!actor || actor.role !== 'admin')) {
  //   throw new AppError('Only an admin can create another account', 403, 'FORBIDDEN');
  // }

  try {
    const user = await User.create({
      name: body.name,
      email,
      phone: body.phone || null,
      passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
      role: 'admin',
      tokenVersion: 0,
      isActive: true,
    });

    setAuthUser(user.id, user);
    return issueSession(user);
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError('This email is already in use', 409, 'CONFLICT');
    }
    throw error;
  }
}

async function login(body) {
  const user = await User.findOne({ email: body.email.toLowerCase() })
    .select(LOGIN_SELECT)
    .lean();

  // Only an account that already exists in the database can log in.
  if (!user || !user.isActive || !user.passwordHash) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  const matches = await bcrypt.compare(body.password, user.passwordHash);
  if (!matches) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  const authUser = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    avatar: user.avatar || null,
    isActive: user.isActive,
    tokenVersion: user.tokenVersion,
  };

  assertAdmin(authUser);
  // Do not block login on password rehash / extra DB write.
  schedulePasswordRehash(authUser.id, body.password, user.passwordHash);
  setAuthUser(authUser.id, authUser);

  return issueSession(authUser);
}

async function refresh(body) {
  const rawRefreshToken = String(body.refreshToken || '').trim();
  if (!rawRefreshToken) {
    throw new AppError('Refresh token is required', 401, 'UNAUTHORIZED');
  }

  let payload;
  try {
    payload = jwt.verify(rawRefreshToken, getConfig().JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
  }

  if (payload.type !== 'refresh' || !payload.sub) {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
  }

  const user = await User.findById(payload.sub).select(REFRESH_SELECT);
  if (!user || !user.isActive) {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
  }
  assertAdmin(user);

  if (Number(user.tokenVersion) !== Number(payload.tv)) {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
  }

  if (
    !user.refreshToken
    || user.refreshToken !== hashToken(rawRefreshToken)
    || !user.refreshTokenExpiresAt
    || user.refreshTokenExpiresAt.getTime() <= Date.now()
  ) {
    await clearRefreshToken(user.id);
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
  }

  setAuthUser(user.id, user);
  return issueSession(user);
}

async function updateAvatar(userId, file) {
  if (!file) throw new AppError('Choose an image file in the avatar field', 400, 'BAD_REQUEST');

  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  assertAdmin(user);

  const previous = user.avatar;
  user.avatar = `/uploads/avatars/${file.filename}`;
  try {
    await user.save();
  } catch (error) {
    removeStoredAvatar(user.avatar);
    throw error;
  }
  removeStoredAvatar(previous);
  return publicUser(user);
}

async function deleteAvatar(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  assertAdmin(user);

  if (!user.avatar) {
    throw new AppError('No avatar image to delete', 404, 'NOT_FOUND');
  }

  const previous = user.avatar;
  user.avatar = null;
  await user.save();
  removeStoredAvatar(previous);
  return publicUser(user);
}

async function me(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  assertAdmin(user);
  return publicUser(user);
}

async function logout(userId) {
  await User.updateOne(
    { _id: userId },
    {
      $inc: { tokenVersion: 1 },
      $set: {
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    }
  );
  invalidateAuthUser(userId);
}

async function forgotPassword(body, publicUrl) {
  const user = await User.findOne({ email: body.email.toLowerCase() });
  if (!user || !user.isActive) {
    throw new AppError('No account found for this email', 404, 'NOT_FOUND');
  }
  assertAdmin(user);

  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetTokenHash: hashResetToken(resetToken),
        passwordResetExpiresAt: expiresAt,
      },
    }
  );

  const resetPasswordUrl = publicUrl
    ? `${publicUrl}/password/reset/${resetToken}`
    : '';

  try {
    await sendMail({
      to: user.email,
      subject: 'Reset your MKS Construction ERP password',
      text: [
        'Your reset password token is :-',
        '',
        resetPasswordUrl,
        '',
        'If you did not request this, please ignore it.',
      ].join('\n'),
      html: `
        <p>Your reset password token is :-</p>
        <p><a href="${escapeHtml(resetPasswordUrl)}">${escapeHtml(resetPasswordUrl)}</a></p>
        <p>If you did not request this, please ignore it.</p>
      `,
    });
  } catch (error) {
    await User.updateOne(
      { _id: user._id },
      { $unset: { passwordResetTokenHash: '', passwordResetExpiresAt: '' } }
    );
    throw error;
  }

  return { email: user.email, expiresAt };
}

async function resetPassword(token, body) {
  if (body.password !== body.confirmPassword) {
    throw new AppError('password does not match', 401, 'UNAUTHORIZED');
  }

  const resetPasswordToken = hashResetToken(token);
  const user = await User.findOne({
    passwordResetTokenHash: resetPasswordToken,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordHash +tokenVersion +passwordResetTokenHash +passwordResetExpiresAt');

  if (!user || !user.isActive) {
    throw new AppError('Reset Password Token is invalid or has been expired', 400, 'BAD_REQUEST');
  }
  assertAdmin(user);

  const samePassword = await bcrypt.compare(body.password, user.passwordHash);
  if (samePassword) {
    throw new AppError('New password must be different from the current password', 400, 'BAD_REQUEST');
  }

  user.passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  user.tokenVersion += 1;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.refreshToken = null;
  user.refreshTokenExpiresAt = null;
  await user.save();
  setAuthUser(user.id, user);

  return issueSession(user);
}

async function changePassword(userId, body) {
  if (body.confirmPassword !== body.newPassword) {
    throw new AppError('Confirm password must match the new password', 400, 'BAD_REQUEST');
  }

  const user = await User.findById(userId).select('+passwordHash +tokenVersion +refreshToken +refreshTokenExpiresAt');
  if (!user || !user.isActive) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  assertAdmin(user);

  const oldPasswordMatches = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!oldPasswordMatches) {
    throw new AppError('Old password does not match the current password', 401, 'UNAUTHORIZED');
  }

  const samePassword = await bcrypt.compare(body.newPassword, user.passwordHash);
  if (samePassword) {
    throw new AppError('New password must be different from the current password', 400, 'BAD_REQUEST');
  }

  const nextVersion = user.tokenVersion + 1;
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS),
        tokenVersion: nextVersion,
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    }
  );
  user.tokenVersion = nextVersion;
  setAuthUser(user.id, user);

  return issueSession(user);
}

module.exports = {
  register,
  login,
  refresh,
  me,
  updateAvatar,
  deleteAvatar,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  assertAdmin,
  BCRYPT_ROUNDS,
};
