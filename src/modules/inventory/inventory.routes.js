const express = require('express');
const validate = require('../../common/middleware/validate');
const schema = require('./inventory.validation');
const controller = require('./inventory.controller');

const router = express.Router();

router.get('/items', validate(schema.listItems), controller.items.list);
router.post('/items', validate(schema.createItem), controller.items.create);
router.get('/items/:id', validate(schema.byId), controller.items.getById);
router.patch('/items/:id', validate(schema.updateItem), controller.items.update);
router.delete('/items/:id', validate(schema.byId), controller.items.remove);
router.post('/items/:id/restore', validate(schema.byId), controller.items.restore);

router.get('/locations', validate(schema.listLocations), controller.locations.list);
router.post('/locations', validate(schema.createLocation), controller.locations.create);
router.get('/locations/:id', validate(schema.byId), controller.locations.getById);
router.patch('/locations/:id', validate(schema.updateLocation), controller.locations.update);
router.delete('/locations/:id', validate(schema.byId), controller.locations.remove);
router.post('/locations/:id/restore', validate(schema.byId), controller.locations.restore);

router.get('/stock/low', validate(schema.listStock), controller.lowStock);
router.get('/stock', validate(schema.listStock), controller.listStock);
router.get('/movements', validate(schema.listMovements), controller.listMovements);
router.post('/movements', validate(schema.createMovement), controller.createMovement);
router.get('/movements/:id', validate(schema.byId), controller.getMovement);

module.exports = router;
