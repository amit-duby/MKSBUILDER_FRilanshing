const asyncHandler = require('../../common/utils/asyncHandler');
const { ok } = require('../../common/utils/apiResponse');
const { withMovementPhoto, withMovementPhotoList } = require('../../common/utils/publicUrl');
const buildController = require('../../common/utils/buildController');
const inventory = require('./inventory.service');

const items = buildController(inventory.items, {
  created: 'Item created',
  listed: 'Items fetched',
  fetched: 'Item fetched',
  updated: 'Item updated',
  removed: 'Item deleted',
});

const listStock = asyncHandler(async (req, res) => {
  const result = await inventory.stock.list(req.query);
  return ok(res, {
    items: result.items,
    counts: result.counts,
  }, 'Stock fetched', result.meta);
});

const listMovements = asyncHandler(async (req, res) => {
  const result = await inventory.movements.listMovements(req.query);
  return ok(res, withMovementPhotoList(req, result.items), 'Stock movements fetched', result.meta);
});

const listIssues = asyncHandler(async (req, res) => {
  const result = await inventory.movements.listIssues(req.query);
  return ok(res, withMovementPhotoList(req, result.items), 'Stock issues fetched', result.meta);
});

const createMovement = asyncHandler(async (req, res) => {
  const data = await inventory.movements.create(req.body, req.user);
  return res.status(201).json({
    success: true,
    message: 'Stock movement recorded',
    data: withMovementPhoto(req, data),
  });
});

const getMovement = asyncHandler(async (req, res) => {
  const data = await inventory.movements.getById(req.params.id);
  return ok(res, withMovementPhoto(req, data), 'Stock movement fetched');
});

const getIssue = asyncHandler(async (req, res) => {
  const data = await inventory.movements.getIssue(req.params.id);
  return ok(res, withMovementPhoto(req, data), 'Stock issue fetched');
});

const updateMovement = asyncHandler(async (req, res) => {
  const data = await inventory.movements.update(req.params.id, req.body, req.user);
  return ok(res, withMovementPhoto(req, data), 'Stock movement updated');
});

const updateIssue = asyncHandler(async (req, res) => {
  const data = await inventory.movements.updateIssue(req.params.id, req.body, req.user);
  return ok(res, withMovementPhoto(req, data), 'Stock issue updated');
});

const deleteMovement = asyncHandler(async (req, res) => {
  await inventory.movements.remove(req.params.id);
  return ok(res, null, 'Stock movement deleted');
});

const deleteIssue = asyncHandler(async (req, res) => {
  await inventory.movements.removeIssue(req.params.id);
  return ok(res, null, 'Stock issue deleted');
});

module.exports = {
  items,
  listStock,
  listMovements,
  listIssues,
  createMovement,
  getMovement,
  getIssue,
  updateMovement,
  updateIssue,
  deleteMovement,
  deleteIssue,
};
