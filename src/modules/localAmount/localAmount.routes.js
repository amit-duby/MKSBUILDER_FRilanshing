const express = require('express');
const validate = require('../../common/middleware/validate');
const { localAmountUpload } = require('../../common/middleware/localAmountUpload');
const schema = require('./localAmount.validation');
const controller = require('./localAmount.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/create', localAmountUpload, validate(schema.create), controller.create);
router.get('/get-by-id/:id', validate(schema.byId), controller.getById);
router.patch('/update/:id', localAmountUpload, validate(schema.update), controller.update);
router.delete('/remove/:id', validate(schema.byId), controller.remove);

module.exports = router;
