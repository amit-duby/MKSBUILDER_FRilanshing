const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
const service = require('./attendance.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.query);
  return ok(res, result.items, 'Attendance fetched', result.meta);
});

const mark = asyncHandler(async (req, res) => {
  const result = await service.mark(req.body, req.user);
  if (result.created) return created(res, result.record, 'Attendance marked');
  return ok(res, result.record, 'Attendance updated');
});

const bulk = asyncHandler(async (req, res) => {
  const data = await service.bulk(req.body, req.user);
  return ok(res, data, 'Attendance register saved');
});

const getById = asyncHandler(async (req, res) => {
  const data = await service.getById(req.params.id);
  return ok(res, data, 'Attendance fetched');
});

const update = asyncHandler(async (req, res) => {
  const data = await service.update(req.params.id, req.body, req.user);
  return ok(res, data, 'Attendance updated');
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  return ok(res, null, 'Attendance removed');
});

const register = asyncHandler(async (req, res) => {
  const result = await service.register(req.query);
  return ok(res, { date: result.date, rows: result.items }, 'Attendance register fetched', result.meta);
});

const summary = asyncHandler(async (req, res) => {
  const result = await service.summary(req.query);
  return ok(
    res,
    { range: result.range, totals: result.totals, employees: result.employees },
    'Attendance summary fetched',
    result.meta
  );
});

module.exports = {
  list,
  mark,
  bulk,
  getById,
  update,
  remove,
  register,
  summary,
};
