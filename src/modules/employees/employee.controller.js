const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
const buildController = require('../../common/utils/buildController');
const service = require('./employee.service');

const crud = buildController(service, {
  created: 'Employee created',
  listed: 'Employees fetched',
  fetched: 'Employee fetched',
  updated: 'Employee updated',
  removed: 'Employee archived',
  restored: 'Employee restored',
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

module.exports = { ...crud, assign, release, listAssignments };
