const express = require('express');
const validate = require('../../common/middleware/validate');
const authenticate = require('../../common/middleware/authenticate');
const asyncHandler = require('../../common/utils/asyncHandler');
const { loginLimiter } = require('../../common/middleware/rateLimit');
const { avatarUpload } = require('../../common/middleware/avatarUpload');
const schema = require('./auth.validation');
const controller = require('./auth.controller');

const router = express.Router();

const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
});

router.post('/register', loginLimiter, optionalAuthenticate, validate(schema.register), controller.register);
router.post('/login', loginLimiter, validate(schema.login), controller.login);
router.post('/forgot-password', loginLimiter, validate(schema.forgotPassword), controller.forgotPassword);
router.post('/reset-password/:token', loginLimiter, validate(schema.resetPassword), controller.resetPassword);
router.get('/me', asyncHandler(authenticate), controller.me);
router.post('/avatar', asyncHandler(authenticate), avatarUpload, controller.updateAvatar);
router.post('/logout', asyncHandler(authenticate), controller.logout);
router.post(
  '/change-password',
  asyncHandler(authenticate),
  validate(schema.changePassword),
  controller.changePassword
);

module.exports = router;
