const express = require('express');
const validate = require('../../common/middleware/validate');
const { employeeUpload } = require('../../common/middleware/employeeUpload');
const compressEmployeePhotos = require('../../common/middleware/compressEmployeePhotos');
const schema = require('./employee.validation');
const controller = require('./employee.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/create', employeeUpload, compressEmployeePhotos, validate(schema.create), controller.create);
router.get('/:id/assignments', validate(schema.assignments), controller.listAssignments);
router.post('/:id/assignments', validate(schema.assign), controller.assign);
router.post('/:id/assignments/release', validate(schema.releaseBySite), controller.releaseBySite);
router.post(
  '/:id/assignments/:assignmentId/release',
  validate(schema.release),
  controller.release
);
router.get('/:id', validate(schema.byId), controller.getById);
router.patch('/update/:id', employeeUpload, compressEmployeePhotos, validate(schema.update), controller.update);
router.delete('/:id', validate(schema.byId), controller.remove);

module.exports = router;
