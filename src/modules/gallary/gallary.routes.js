const express = require('express');
const validate = require('../../common/middleware/validate');
const { gallaryUpload } = require('../../common/middleware/gallaryUpload');
const schema = require('./gallary.validation');
const controller = require('./gallary.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/create', gallaryUpload, validate(schema.create), controller.create);
router.get('/get-by-id/:id', validate(schema.byId), controller.getById);
router.patch('/update/:id', gallaryUpload, validate(schema.update), controller.update);
router.delete('/remove/:id', validate(schema.byId), controller.remove);

module.exports = router;
