const asyncHandler = require('../../common/utils/asyncHandler');
const { ok } = require('../../common/utils/apiResponse');
const dashboardService = require('./dashboard.service');

const overview = asyncHandler(async (_req, res) => {
  const data = await dashboardService.overview();
  return ok(res, data, 'Dashboard fetched');
});

module.exports = { overview };
