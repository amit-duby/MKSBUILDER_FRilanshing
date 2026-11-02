const express = require('express');
const validate = require('../../common/middleware/validate');
const { maintenanceUpload } = require('../../common/middleware/maintenanceUpload');
const schema = require('./vehicle.validation');
const controller = require('./vehicle.controller');
const maintenanceCategoryRoutes = require('./maintenanceCategory.routes');

const router = express.Router();

router.use('/maintenance-categories', maintenanceCategoryRoutes);
router.get('/alerts', validate(schema.alerts), controller.alerts);
router.get('/', validate(schema.list), controller.list);
router.post('/', validate(schema.create), controller.create);
router.get('/:id/maintenance', validate(schema.pagedChild), controller.listMaintenance);
router.post('/:id/maintenance', maintenanceUpload, validate(schema.maintenance), controller.addMaintenance);
router.post(
  '/:id/maintenance/:maintenanceId/complete',
  maintenanceUpload,
  validate(schema.complete),
  controller.completeMaintenance
);
router.delete(
  '/:id/maintenance/:maintenanceId',
  validate(schema.deleteMaintenance),
  controller.deleteMaintenance
);
router.get('/:id', validate(schema.byId), controller.getById);
router.patch('/:id', validate(schema.update), controller.update);
router.delete('/:id', validate(schema.byId), controller.remove);

module.exports = router;
