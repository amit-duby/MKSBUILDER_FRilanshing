const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
const { withMaintenanceImages, withMaintenanceImageList } = require('../../common/utils/publicUrl');
const buildController = require('../../common/utils/buildController');
const service = require('./vehicle.service');

const crud = buildController(service, {
  created: 'Vehicle created',
  listed: 'Vehicles fetched',
  fetched: 'Vehicle fetched',
  updated: 'Vehicle updated',
  removed: 'Vehicle deleted',
});

const alerts = asyncHandler(async (req, res) => {
  const data = await service.alerts(req.query);
  return ok(res, data, 'Vehicle document alerts fetched');
});

const addMaintenance = asyncHandler(async (req, res) => {
  const data = await service.addMaintenance(req.params.id, req.body);
  return created(res, withMaintenanceImages(req, data), 'Maintenance logged');
});

const listMaintenance = asyncHandler(async (req, res) => {
  const result = await service.listMaintenance(req.params.id, req.query);
  return ok(res, withMaintenanceImageList(req, result.items), 'Maintenance logs fetched', result.meta);
});

const completeMaintenance = asyncHandler(async (req, res) => {
  const data = await service.completeMaintenance(req.params.id, req.params.maintenanceId, req.body);
  return ok(res, withMaintenanceImages(req, data), 'Maintenance completed');
});

const deleteMaintenance = asyncHandler(async (req, res) => {
  await service.removeMaintenance(req.params.id, req.params.maintenanceId);
  return ok(res, null, 'Maintenance log deleted');
});

module.exports = {
  ...crud,
  alerts,
  addMaintenance,
  listMaintenance,
  completeMaintenance,
  deleteMaintenance,
};
