const express = require('express');
const validate = require('../../common/middleware/validate');
const schema = require('./contactdetails.validation');
const controller = require('./contactdetails.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/create', validate(schema.create), controller.create);
router.patch('/update/:id', validate(schema.update), controller.update);
router.delete('/remove/:id', validate(schema.byId), controller.remove);

module.exports = router;
