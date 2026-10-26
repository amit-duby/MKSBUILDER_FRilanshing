const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
const authService = require('./auth.service');

const register = asyncHandler(async (req, res) => {
  const data = await authService.register(req.body, req.user);
  return created(res, data, 'Account created');
});

const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body);
  return ok(res, data, 'Logged in');
});

const me = asyncHandler(async (req, res) => {
  const data = await authService.me(req.user.id);
  return ok(res, data, 'Profile fetched');
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.id);
  return ok(res, null, 'Logged out');
});

const forgotPassword = asyncHandler(async (req, res) => {
  const data = await authService.forgotPassword(req.body);
  return ok(res, data, 'Password reset email sent');
});

const resetPassword = asyncHandler(async (req, res) => {
  const data = await authService.resetPassword(req.body);
  return ok(res, data, 'Password reset');
});

const changePassword = asyncHandler(async (req, res) => {
  const data = await authService.changePassword(req.user.id, req.body);
  return ok(res, data, 'Password changed');
});

module.exports = { register, login, me, logout, forgotPassword, resetPassword, changePassword };
