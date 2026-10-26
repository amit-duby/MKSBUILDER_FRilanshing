const express = require('express');
const validate = require('../../common/middleware/validate');
const schema = require('./site.validation');
const controller = require('./site.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/create', validate(schema.create), controller.create);
router.get('/:id', validate(schema.byId), controller.getById);
router.patch('/update/:id', validate(schema.update), controller.update);
router.delete('/delete/:id', validate(schema.byId), controller.remove);
router.post('/:id/restore', validate(schema.byId), controller.restore);

module.exports = router;
