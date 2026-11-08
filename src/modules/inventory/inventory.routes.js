const express = require('express');
const validate = require('../../common/middleware/validate');
const { movementUpload } = require('../../common/middleware/movementUpload');
const schema = require('./inventory.validation');
const controller = require('./inventory.controller');

const router = express.Router();

router.get('/items', validate(schema.listItems), controller.items.list);
router.post('/items', validate(schema.createItem), controller.items.create);
router.get('/items/:id', validate(schema.byId), controller.items.getById);
router.patch('/items/:id', validate(schema.updateItem), controller.items.update);
router.delete('/items/:id', validate(schema.byId), controller.items.remove);

router.get('/stock/low', validate(schema.listStock), controller.lowStock);
router.get('/stock', validate(schema.listStock), controller.listStock);
router.get('/movements', validate(schema.listMovements), controller.listMovements);
router.post(
  '/movements',
  movementUpload,
  validate(schema.createMovement),
  controller.createMovement
);
router.patch(
  '/movements/:id',
  movementUpload,
  validate(schema.updateMovement),
  controller.updateMovement
);
router.get('/movements/:id', validate(schema.byId), controller.getMovement);
router.delete('/movements/:id', validate(schema.byId), controller.removeMovement);

router.get('/issues', validate(schema.listIssues), controller.listIssues);
router.post(
  '/issues',
  movementUpload,
  validate(schema.createIssue),
  controller.createIssue
);
router.patch(
  '/issues/:id',
  movementUpload,
  validate(schema.updateIssue),
  controller.updateIssue
);
router.get('/issues/:id', validate(schema.byId), controller.getIssue);
router.delete('/issues/:id', validate(schema.byId), controller.removeIssue);

module.exports = router;
