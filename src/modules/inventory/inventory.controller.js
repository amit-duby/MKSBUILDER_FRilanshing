const asyncHandler = require('../../common/utils/asyncHandler');
const { ok } = require('../../common/utils/apiResponse');
const buildController = require('../../common/utils/buildController');
const inventory = require('./inventory.service');

const items = buildController(inventory.items, {
  created: 'Item created',
  listed: 'Items fetched',
  fetched: 'Item fetched',
  updated: 'Item updated',
  removed: 'Item archived',
  restored: 'Item restored',
});

const locations = buildController(inventory.locations, {
  created: 'Stock location created',
  listed: 'Stock locations fetched',
  fetched: 'Stock location fetched',
  updated: 'Stock location updated',
  removed: 'Stock location archived',
  restored: 'Stock location restored',
});

const listStock = asyncHandler(async (req, res) => {
  const result = await inventory.stock.list(req.query);
  return ok(res, result.items, 'Stock balances fetched', result.meta);
});

const lowStock = asyncHandler(async (req, res) => {
  const result = await inventory.stock.low(req.query);
  return ok(res, result.items, 'Low stock items fetched', result.meta);
});

const listMovements = asyncHandler(async (req, res) => {
  const result = await inventory.movements.list(req.query);
  return ok(res, result.items, 'Stock movements fetched', result.meta);
});

const createMovement = asyncHandler(async (req, res) => {
  const data = await inventory.movements.create(req.body, req.user);
  return res.status(201).json({ success: true, message: 'Stock movement recorded', data });
});

const getMovement = asyncHandler(async (req, res) => {
  const data = await inventory.movements.getById(req.params.id);
  return ok(res, data, 'Stock movement fetched');
});

module.exports = {
  items,
  locations,
  listStock,
  lowStock,
  listMovements,
  createMovement,
  getMovement,
};
