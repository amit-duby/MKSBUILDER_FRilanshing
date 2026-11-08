const express = require('express');
const validate = require('../../common/middleware/validate');
const { maintenanceUpload } = require('../../common/middleware/maintenanceUpload');
const schema = require('./vehicle.validation');
const controller = require('./vehicle.controller');
const maintenanceCategoryRoutes = require('./maintenanceCategory.routes');
const vehicleTypeRoutes = require('./vehicleType.routes');

const router = express.Router();

router.use('/types', vehicleTypeRoutes);
router.use('/maintenance-categories', maintenanceCategoryRoutes);
router.get('/alerts', validate(schema.alerts), controller.alerts);
router.get('/assignments', validate(schema.listAllAssignments), controller.listAllAssignments);
router.get('/maintenance', validate(schema.listAllMaintenance), controller.listAllMaintenance);
router.post(
  '/maintenance/create',
  maintenanceUpload,
  validate(schema.maintenance),
  controller.addMaintenance
);
router.patch(
  '/maintenance/update/:id',
  maintenanceUpload,
  validate(schema.updateMaintenance),
  controller.updateMaintenance
);
router.delete(
  '/maintenance/delete/:id',
  validate(schema.byId),
  controller.removeMaintenance
);
router.get('/', validate(schema.list), controller.list);
router.post('/', validate(schema.create), controller.create);
router.get('/:id/assignments', validate(schema.pagedChild), controller.listAssignments);
router.post('/:id/assign', validate(schema.assign), controller.assign);
router.post('/:id/release', validate(schema.release), controller.release);
router.get('/:id/maintenance', validate(schema.pagedChild), controller.listMaintenance);
router.get('/:id', validate(schema.byId), controller.getById);
router.patch('/:id', validate(schema.update), controller.update);
router.delete('/:id', validate(schema.byId), controller.remove);

module.exports = router;
