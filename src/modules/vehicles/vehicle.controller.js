const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
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

const assign = asyncHandler(async (req, res) => {
  const data = await service.assign(req.params.id, req.body);
  return created(res, data, 'Vehicle assigned');
});

const release = asyncHandler(async (req, res) => {
  const data = await service.release(req.params.id, req.body);
  return ok(res, data, 'Vehicle released');
});

const listAllAssignments = asyncHandler(async (req, res) => {
  const result = await service.listAllAssignments(req.query);
  return ok(res, result.items, 'Vehicle assignments fetched', result.meta);
});

const listAssignments = asyncHandler(async (req, res) => {
  const result = await service.listAssignments(req.params.id, req.query);
  return ok(res, result.items, 'Vehicle assignments fetched', result.meta);
});

const addMaintenance = asyncHandler(async (req, res) => {
  const data = await service.addMaintenance(req.body.vehicleId, req.body, req.user);
  return created(res, data, 'Maintenance logged');
});

const listAllMaintenance = asyncHandler(async (req, res) => {
  const result = await service.listAllMaintenance(req.query);
  return ok(res, {
    items: result.items,
    categoryCounts: result.categoryCounts,
  }, 'Maintenance logs fetched', result.meta);
});

const listMaintenance = asyncHandler(async (req, res) => {
  const result = await service.listMaintenance(req.params.id, req.query);
  return ok(res, {
    items: result.items,
    categoryCounts: result.categoryCounts,
  }, 'Maintenance logs fetched', result.meta);
});

const getMaintenance = asyncHandler(async (req, res) => {
  const data = await service.getMaintenance(req.params.id);
  return ok(res, data, 'Maintenance log fetched');
});

const updateMaintenance = asyncHandler(async (req, res) => {
  const data = await service.updateMaintenance(req.params.id, req.body, req.user);
  return ok(res, data, 'Maintenance updated');
});

const removeMaintenance = asyncHandler(async (req, res) => {
  const data = await service.removeMaintenance(req.params.id);
  return ok(res, data, 'Maintenance deleted');
});

module.exports = {
  ...crud,
  alerts,
  assign,
  release,
  listAllAssignments,
  listAssignments,
  addMaintenance,
  listAllMaintenance,
  listMaintenance,
  getMaintenance,
  updateMaintenance,
  removeMaintenance,
};
