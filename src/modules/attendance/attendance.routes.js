const express = require('express');
const validate = require('../../common/middleware/validate');
const schema = require('./attendance.validation');
const controller = require('./attendance.controller');

const router = express.Router();

router.get('/register', validate(schema.register), controller.register);
router.get('/summary', validate(schema.summary), controller.summary);
router.get('/', validate(schema.list), controller.list);
router.post('/bulk', validate(schema.bulk), controller.bulk);
router.post('/', validate(schema.mark), controller.mark);
router.get('/:id', validate(schema.byId), controller.getById);
router.patch('/:id', validate(schema.update), controller.update);
router.delete('/:id', validate(schema.byId), controller.remove);

module.exports = router;
