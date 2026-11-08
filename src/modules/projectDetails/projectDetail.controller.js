const asyncHandler = require('../../common/utils/asyncHandler');
const { ok } = require('../../common/utils/apiResponse');
const buildController = require('../../common/utils/buildController');
const service = require('./projectDetail.service');

const crud = buildController(service, {
  created: 'Project detail created',
  listed: 'Project details fetched',
  fetched: 'Project detail fetched',
  updated: 'Project detail updated',
  removed: 'Project detail deleted',
});

const addClientInstallment = asyncHandler(async (req, res) => {
  const data = await service.addClientInstallment(req.params.id, req.body);
  return ok(res, data, 'Client installment added');
});

const removeClientInstallment = asyncHandler(async (req, res) => {
  const data = await service.removeClientInstallment(req.params.id, req.params.entryId);
  return ok(res, data, 'Client installment removed');
});

const addProjectSpend = asyncHandler(async (req, res) => {
  const data = await service.addProjectSpend(req.params.id, req.body);
  return ok(res, data, 'Project spend added');
});

const removeProjectSpend = asyncHandler(async (req, res) => {
  const data = await service.removeProjectSpend(req.params.id, req.params.entryId);
  return ok(res, data, 'Project spend removed');
});

module.exports = {
  ...crud,
  addClientInstallment,
  removeClientInstallment,
  addProjectSpend,
  removeProjectSpend,
};
