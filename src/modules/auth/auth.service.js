const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getConfig } = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const { sendMail } = require('../../common/mail/mailer');
const User = require('./user.model');
const {
  issueSession,
  rotateRefreshToken,
  revokeUserRefreshTokens,
  signAccessToken,
  publicUser,
} = require('./session');

const BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function sessionFor(user) {
  return issueSession(user);
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
      passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
      role: 'admin',
      tokenVersion: 0,
      isActive: true,
    });

    return sessionFor(user);
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError('This email is already in use', 409, 'CONFLICT');
    }
    throw error;
  }
}

async function login(body) {
  const user = await User.findOne({ email: body.email.toLowerCase() }).select('+passwordHash +tokenVersion');

  // Only an account that already exists in the database can log in.
  if (!user || !user.isActive) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  const matches = await bcrypt.compare(body.password, user.passwordHash);
  if (!matches) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }

  assertAdmin(user);

  // Older accounts were stored at a higher cost. Rewrite once so the next login stays under 800ms.
  if (bcrypt.getRounds(user.passwordHash) > BCRYPT_ROUNDS) {
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS) } }
    );
  }

  return sessionFor(user);
}

async function refresh(rawToken) {
  if (!rawToken) {
    throw new AppError('Refresh token is required', 401, 'UNAUTHORIZED');
  }
  const rotated = await rotateRefreshToken(rawToken);
  const user = await User.findById(rotated.userId).select('+tokenVersion');
  if (!user || !user.isActive) {
    throw new AppError('Invalid or expired refresh token', 401, 'UNAUTHORIZED');
  }
  assertAdmin(user);
  const accessToken = signAccessToken(user);
  return {
    token: accessToken,
    accessToken,
    refreshToken: rotated.refresh.token,
    expiresIn: getConfig().JWT_EXPIRES_IN,
    refreshExpiresIn: getConfig().JWT_REFRESH_EXPIRES_IN,
    refreshExpiresAt: rotated.refresh.expiresAt,
    user: publicUser(user),
  };
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

async function me(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  assertAdmin(user);
  return publicUser(user);
}

async function logout(userId) {
  await Promise.all([
    revokeUserRefreshTokens(userId),
    User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }),
  ]);
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

  const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
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
  await user.save();
  await revokeUserRefreshTokens(user.id);

  return sessionFor(user);
}

async function listUsers(query) {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const filter = {};
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  return {
    items: items.map(publicUser),
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / limit),
    },
  };
}

async function remove(id) {
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
  const remaining = await User.countDocuments({ _id: { $ne: user._id } });
  if (remaining === 0) {
    throw new AppError('The last user account cannot be deleted', 409, 'CONFLICT');
  }
  removeStoredAvatar(user.avatar);
  await revokeUserRefreshTokens(user.id);
  await user.deleteOne();
}

async function changePassword(userId, body) {
  if (body.confirmPassword !== body.newPassword) {
    throw new AppError('Confirm password must match the new password', 400, 'BAD_REQUEST');
  }

  const user = await User.findById(userId).select('+passwordHash +tokenVersion');
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
      },
    }
  );
  user.tokenVersion = nextVersion;
  await revokeUserRefreshTokens(user.id);

  return sessionFor(user);
}

module.exports = {
  register,
  login,
  refresh,
  me,
  updateAvatar,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  listUsers,
  remove,
  assertAdmin,
  BCRYPT_ROUNDS,
};
