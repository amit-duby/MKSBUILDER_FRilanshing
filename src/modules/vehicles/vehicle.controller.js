const asyncHandler = require('../../common/utils/asyncHandler');
const { ok, created } = require('../../common/utils/apiResponse');
const buildController = require('../../common/utils/buildController');
const service = require('./vehicle.service');

const crud = buildController(service, {
  created: 'Vehicle created',
  listed: 'Vehicles fetched',
  fetched: 'Vehicle fetched',
  updated: 'Vehicle updated',
  removed: 'Vehicle archived',
  restored: 'Vehicle restored',
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

const listAssignments = asyncHandler(async (req, res) => {
  const result = await service.listAssignments(req.params.id, req.query);
  return ok(res, result.items, 'Vehicle assignments fetched', result.meta);
});

const addMaintenance = asyncHandler(async (req, res) => {
  const data = await service.addMaintenance(req.params.id, req.body, req.user);
  return created(res, data, 'Maintenance logged');
});

const listMaintenance = asyncHandler(async (req, res) => {
  const result = await service.listMaintenance(req.params.id, req.query);
  return ok(res, result.items, 'Maintenance logs fetched', result.meta);
});

const completeMaintenance = asyncHandler(async (req, res) => {
  const data = await service.completeMaintenance(req.params.id, req.params.maintenanceId, req.body);
  return ok(res, data, 'Maintenance completed');
});

const addFuel = asyncHandler(async (req, res) => {
  const data = await service.addFuel(req.params.id, req.body, req.user);
  return created(res, data, 'Fuel log recorded');
});

const listFuel = asyncHandler(async (req, res) => {
  const result = await service.listFuel(req.params.id, req.query);
  return ok(res, result.items, 'Fuel logs fetched', result.meta);
});

module.exports = {
  ...crud,
  alerts,
  assign,
  release,
  listAssignments,
  addMaintenance,
  listMaintenance,
  completeMaintenance,
  addFuel,
  listFuel,
};
