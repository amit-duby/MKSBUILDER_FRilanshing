const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getConfig } = require('../../config/env');
const AppError = require('../../common/errors/AppError');
const { sendMail } = require('../../common/mail/mailer');
const User = require('./user.model');

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

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
  };
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

  return {
    token: signToken(user),
    user: publicUser(user),
  };
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

async function forgotPassword(body) {
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

  try {
    await sendMail({
      to: user.email,
      subject: 'Reset your MKS Construction ERP password',
      text: [
        `Hello ${user.name},`,
        '',
        'Use this token to reset your password. It expires in 15 minutes and can be used once.',
        '',
        `Reset token: ${resetToken}`,
        `Expires at: ${expiresAt.toISOString()}`,
        '',
        'Send this token and a new password to POST /api/v1/auth/reset-password.',
        '',
        'If you did not request this, you can ignore this email.',
      ].join('\n'),
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

async function resetPassword(body) {
  const user = await User.findOne({
    passwordResetTokenHash: hashResetToken(body.token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordHash +tokenVersion +passwordResetTokenHash +passwordResetExpiresAt');

  if (!user || !user.isActive) {
    throw new AppError('Reset token is invalid or expired', 400, 'BAD_REQUEST');
  }
  assertAdmin(user);

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
      $unset: {
        passwordResetTokenHash: '',
        passwordResetExpiresAt: '',
      },
    }
  );
  user.tokenVersion = nextVersion;

  return {
    token: signToken(user),
    user: publicUser(user),
  };
}

async function changePassword(userId, body) {
  if (body.currentPassword === body.newPassword) {
    throw new AppError('New password must be different from the current password', 400, 'BAD_REQUEST');
  }

  const user = await User.findById(userId).select('+passwordHash +tokenVersion');
  if (!user) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

  const matches = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!matches) throw new AppError('Current password is incorrect', 401, 'UNAUTHORIZED');
  assertAdmin(user);

  user.passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS);
  user.tokenVersion += 1;
  await user.save();

  return {
    token: signToken(user),
    user: publicUser(user),
  };
}

module.exports = {
  register,
  login,
  me,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  assertAdmin,
  BCRYPT_ROUNDS,
};
