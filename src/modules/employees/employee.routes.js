const express = require('express');
const validate = require('../../common/middleware/validate');
const schema = require('./employee.validation');
const controller = require('./employee.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/create', validate(schema.create), controller.create);
router.get('/:id/assignments', validate(schema.assignments), controller.listAssignments);
router.post('/:id/assignments', validate(schema.assign), controller.assign);
router.post(
  '/:id/assignments/:assignmentId/release',
  validate(schema.release),
  controller.release
);
router.get('/:id', validate(schema.byId), controller.getById);
router.patch('/update/:id', validate(schema.update), controller.update);
router.delete('/:id', validate(schema.byId), controller.remove);
router.post('/:id/restore', validate(schema.byId), controller.restore);

module.exports = router;
