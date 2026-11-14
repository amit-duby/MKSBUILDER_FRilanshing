const express = require('express');
const validate = require('../../common/middleware/validate');
const { companyUpload } = require('../../common/middleware/companyUpload');
const schema = require('./company.validation');
const controller = require('./company.controller');

const router = express.Router();

router.get('/', validate(schema.list), controller.list);
router.post('/create', companyUpload, validate(schema.create), controller.create);
router.get('/get-by-id/:id', validate(schema.byId), controller.getById);
router.patch('/update/:id', companyUpload, validate(schema.update), controller.update);
router.delete('/remove/:id', validate(schema.byId), controller.remove);

module.exports = router;
