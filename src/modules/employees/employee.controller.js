const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
const { withEmployeePhotos, withEmployeePhotoList } = require('../../common/utils/publicUrl');
const service = require('./employee.service');

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.body);
  return created(res, withEmployeePhotos(req, data), 'Employee created');
});

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.query);
  return ok(res, withEmployeePhotoList(req, result.items), 'Employees fetched', result.meta);
});

const getById = asyncHandler(async (req, res) => {
  const data = await service.getById(req.params.id);
  return ok(res, withEmployeePhotos(req, data), 'Employee fetched');
});

const update = asyncHandler(async (req, res) => {
  const data = await service.update(req.params.id, req.body);
  return ok(res, withEmployeePhotos(req, data), 'Employee updated');
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  return ok(res, null, 'Employee deleted');
});

const assign = asyncHandler(async (req, res) => {
  const data = await service.assign(req.params.id, req.body);
  return created(res, data, 'Employee assigned to site');
});

const release = asyncHandler(async (req, res) => {
  const data = await service.release(req.params.id, req.params.assignmentId, req.body);
  return ok(res, data, 'Site assignment closed');
});

const listAssignments = asyncHandler(async (req, res) => {
  const data = await service.listAssignments(req.params.id, req.query);
  return ok(res, data, 'Assignments fetched');
});

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
  assign,
  release,
  listAssignments,
};
