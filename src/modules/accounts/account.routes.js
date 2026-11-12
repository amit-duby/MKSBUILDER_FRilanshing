const express = require('express');
const validate = require('../../common/middleware/validate');
const { advanceUpload } = require('../../common/middleware/advanceUpload');
const schema = require('./account.validation');
const controller = require('./account.controller');

const router = express.Router();

router.get('/summary', validate(schema.summary), controller.summary);
router.get('/employees/:employeeId/statement', validate(schema.statement), controller.statement);

router.get('/advances', validate(schema.listAdvances), controller.listAdvances);
router.post('/advances', advanceUpload, validate(schema.createAdvance), controller.createAdvance);
router.get('/advances/:id', validate(schema.byId), controller.getAdvance);
router.patch('/advances/:id', advanceUpload, validate(schema.updateAdvance), controller.updateAdvance);
router.post('/advances/:id/recover', validate(schema.recoverAdvance), controller.recoverAdvance);
router.post('/advances/:id/void', validate(schema.voidAdvance), controller.voidAdvance);

router.get('/payroll', validate(schema.listPayroll), controller.listPayroll);
router.post('/payroll/pay', validate(schema.payPayroll), controller.payPayroll);
router.get('/payroll/:id', validate(schema.getPayrollById), controller.getPayrollById);

module.exports = router;
