const express = require('express');
const validate = require('../../common/middleware/validate');
const schema = require('./vehicle.validation');
const controller = require('./vehicle.controller');

const router = express.Router();

router.get('/alerts', validate(schema.alerts), controller.alerts);
router.get('/', validate(schema.list), controller.list);
router.post('/', validate(schema.create), controller.create);
router.get('/:id/assignments', validate(schema.pagedChild), controller.listAssignments);
router.post('/:id/assign', validate(schema.assign), controller.assign);
router.post('/:id/release', validate(schema.release), controller.release);
router.get('/:id/maintenance', validate(schema.pagedChild), controller.listMaintenance);
router.post('/:id/maintenance', validate(schema.maintenance), controller.addMaintenance);
router.post(
  '/:id/maintenance/:maintenanceId/complete',
  validate(schema.complete),
  controller.completeMaintenance
);
router.get('/:id/fuel-logs', validate(schema.pagedChild), controller.listFuel);
router.post('/:id/fuel-logs', validate(schema.fuel), controller.addFuel);
router.get('/:id', validate(schema.byId), controller.getById);
router.patch('/:id', validate(schema.update), controller.update);
router.delete('/:id', validate(schema.byId), controller.remove);
router.post('/:id/restore', validate(schema.byId), controller.restore);

module.exports = router;
