const express = require('express');
const validate = require('../../common/middleware/validate');
const schema = require('./vehicleType.validation');
const controller = require('./vehicleType.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/', validate(schema.create), controller.create);
router.get('/:id', validate(schema.byId), controller.getById);
router.patch('/:id', validate(schema.update), controller.update);
router.delete('/:id', validate(schema.byId), controller.remove);

module.exports = router;
