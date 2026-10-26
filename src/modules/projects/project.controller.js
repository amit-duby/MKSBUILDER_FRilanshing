const asyncHandler = require('../../common/utils/asyncHandler');
const { ok } = require('../../common/utils/apiResponse');
const buildController = require('../../common/utils/buildController');
const service = require('./project.service');

const crud = buildController(service, {
  created: 'Project created',
  listed: 'Projects fetched',
  fetched: 'Project fetched',
  updated: 'Project updated',
  removed: 'Project archived',
  restored: 'Project restored',
});

const summary = asyncHandler(async (req, res) => {
  const data = await service.summary(req.params.id);
  return ok(res, data, 'Project summary fetched');
});

module.exports = { ...crud, summary };
