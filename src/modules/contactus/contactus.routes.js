const express = require('express');
const validate = require('../../common/middleware/validate');
const schema = require('./contactus.validation');
const controller = require('./contactus.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/create', validate(schema.create), controller.create);
router.delete('/remove/:id', validate(schema.byId), controller.remove);

module.exports = router;
