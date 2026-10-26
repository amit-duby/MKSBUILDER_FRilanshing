const AppError = require('../errors/AppError');
const logger = require('../utils/logger');
const duplicateMessage = require('../utils/duplicateMessage');

function normalize(error) {
  if (error.type === 'entity.parse.failed') {
    return new AppError('Invalid JSON body', 400, 'BAD_REQUEST');
  }

  if (error.code === 11000) {
    return new AppError(duplicateMessage(error), 409, 'CONFLICT');
  }

  if (error.name === 'CastError') {
    return new AppError('Invalid identifier', 400, 'BAD_REQUEST');
  }

  if (error.name === 'ValidationError' && error.errors) {
    const details = Object.values(error.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));
    return new AppError('Validation failed', 422, 'VALIDATION_ERROR', details);
  }

  return error;
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const error = normalize(err);
  const operational = Boolean(error.isOperational);
  const statusCode = operational ? error.statusCode : 500;
  const payload = {
    success: false,
    message: operational ? error.message : 'Something went wrong',
    code: operational ? error.code : 'INTERNAL_ERROR',
    requestId: req.id,
  };

  if (operational && error.details) payload.details = error.details;
  if (!operational && process.env.NODE_ENV !== 'production') payload.stack = error.stack;

  const logPayload = { err, requestId: req.id, path: req.originalUrl };
  if (statusCode >= 500) logger.error(logPayload, error.message);
  else logger.warn(logPayload, error.message);

  res.status(statusCode).json(payload);
}

module.exports = errorHandler;
