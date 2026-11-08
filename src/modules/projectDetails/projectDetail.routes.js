const express = require('express');
const validate = require('../../common/middleware/validate');
const schema = require('./projectDetail.validation');
const controller = require('./projectDetail.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/create', validate(schema.create), controller.create);
router.get('/get-by-id/:id', validate(schema.byId), controller.getById);
router.patch('/update/:id', validate(schema.update), controller.update);
router.delete('/remove/:id', validate(schema.byId), controller.remove);

router.post(
  '/:id/client-installments',
  validate(schema.addClientInstallment),
  controller.addClientInstallment
);
router.delete(
  '/:id/client-installments/:entryId',
  validate(schema.removeClientInstallment),
  controller.removeClientInstallment
);

router.post(
  '/:id/project-spends',
  validate(schema.addProjectSpend),
  controller.addProjectSpend
);
router.delete(
  '/:id/project-spends/:entryId',
  validate(schema.removeProjectSpend),
  controller.removeProjectSpend
);

module.exports = router;
