const asyncHandler = require('../../common/utils/asyncHandler');
const { ok } = require('../../common/utils/apiResponse');
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
    lowItems: result.lowItems,
  }, 'Stock balances fetched', result.meta);
});

const lowStock = asyncHandler(async (req, res) => {
  const result = await inventory.stock.low(req.query);
  return ok(res, result.items, 'Low stock items fetched', result.meta);
});

const listMovements = asyncHandler(async (req, res) => {
  const result = await inventory.movements.listMovements(req.query);
  return ok(res, result.items, 'Stock movements fetched', result.meta);
});

const listIssues = asyncHandler(async (req, res) => {
  const result = await inventory.movements.listIssues(req.query);
  return ok(res, result.items, 'Stock issues fetched', result.meta);
});

const createMovement = asyncHandler(async (req, res) => {
  const data = await inventory.movements.create(req.body, req.user);
  return res.status(201).json({ success: true, message: 'Stock movement recorded', data });
});

const createIssue = asyncHandler(async (req, res) => {
  const data = await inventory.movements.createIssue(req.body, req.user);
  return res.status(201).json({ success: true, message: 'Stock issue recorded', data });
});

const getMovement = asyncHandler(async (req, res) => {
  const data = await inventory.movements.getById(req.params.id);
  return ok(res, data, 'Stock movement fetched');
});

const getIssue = asyncHandler(async (req, res) => {
  const data = await inventory.movements.getIssue(req.params.id);
  return ok(res, data, 'Stock issue fetched');
});

const updateMovement = asyncHandler(async (req, res) => {
  const data = await inventory.movements.update(req.params.id, req.body, req.user);
  return ok(res, data, 'Stock movement updated');
});

const updateIssue = asyncHandler(async (req, res) => {
  const data = await inventory.movements.updateIssue(req.params.id, req.body, req.user);
  return ok(res, data, 'Stock issue updated');
});

const removeMovement = asyncHandler(async (req, res) => {
  await inventory.movements.remove(req.params.id);
  return ok(res, null, 'Stock movement deleted');
});

const removeIssue = asyncHandler(async (req, res) => {
  await inventory.movements.removeIssue(req.params.id);
  return ok(res, null, 'Stock issue deleted');
});

module.exports = {
  items,
  listStock,
  lowStock,
  listMovements,
  listIssues,
  createMovement,
  createIssue,
  getMovement,
  getIssue,
  updateMovement,
  updateIssue,
  removeMovement,
  removeIssue,
};
