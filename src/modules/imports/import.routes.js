const express = require('express');
const { excelUpload } = require('./excelUpload');
const controller = require('./import.controller');

const router = express.Router();

router.get('/template', controller.template);
router.post('/preview', excelUpload, controller.preview);
router.post('/', excelUpload, controller.importAll);

module.exports = router;
