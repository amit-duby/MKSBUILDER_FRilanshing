const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getConfig } = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const { sendMail } = require('../../common/mail/mailer');
const User = require('./user.model');

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

function signToken(user) {
  const config = getConfig();
  return jwt.sign(
    { sub: user.id, tv: user.tokenVersion, email: user.email },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
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

    return {
      token: signToken(user),
      user: publicUser(user),
    };
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

  return {
    token: signToken(user),
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
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
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

  return {
    token: signToken(user),
    user: publicUser(user),
  };
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

  return {
    token: signToken(user),
    user: publicUser(user),
  };
}

module.exports = {
  register,
  login,
  me,
  updateAvatar,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  assertAdmin,
  BCRYPT_ROUNDS,
};
