const jwt = require('jsonwebtoken');
const { getConfig } = require('../../config/env');
const AppError = require('../errors/AppError');
const User = require('../../modules/auth/user.model');
const { assertAdmin } = require('../../modules/auth/auth.service');

async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  let payload;
  try {
    payload = jwt.verify(token, getConfig().JWT_SECRET);
  } catch {
    throw new AppError('Invalid or expired token', 401, 'UNAUTHORIZED');
  }

  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  assertAdmin(user);

  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  next();
}

module.exports = authenticate;
