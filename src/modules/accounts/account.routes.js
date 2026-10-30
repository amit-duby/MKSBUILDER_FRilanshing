const express = require('express');
const validate = require('../../common/middleware/validate');
const { advanceUpload } = require('../../common/middleware/advanceUpload');
const { localExpenseUpload } = require('../../common/middleware/localExpenseUpload');
const schema = require('./account.validation');
const controller = require('./account.controller');

const router = express.Router();

// These routes record salary sheets and expenses. They do not pay employees.
router.get('/summary', validate(schema.summary), controller.summary);
router.get('/employees/:employeeId/statement', validate(schema.statement), controller.statement);

router.get('/salaries', validate(schema.listSalaries), controller.listSalaries);
router.post('/salaries', validate(schema.createSalary), controller.createSalary);
router.get('/salaries/:id', validate(schema.byId), controller.getSalary);
router.patch('/salaries/:id', validate(schema.updateSalary), controller.updateSalary);
router.post('/salaries/:id/void', validate(schema.voidSalary), controller.voidSalary);

router.get('/expenses', validate(schema.listExpenses), controller.listExpenses);
router.post('/expenses', validate(schema.createExpense), controller.createExpense);
router.get('/expenses/:id', validate(schema.byId), controller.getExpense);
router.patch('/expenses/:id', validate(schema.updateExpense), controller.updateExpense);
router.post('/expenses/:id/void', validate(schema.voidExpense), controller.voidExpense);

router.get('/advances', validate(schema.listAdvances), controller.listAdvances);
router.post('/advances', advanceUpload, validate(schema.createAdvance), controller.createAdvance);
router.get('/advances/:id', validate(schema.byId), controller.getAdvance);
router.patch('/advances/:id', advanceUpload, validate(schema.updateAdvance), controller.updateAdvance);
router.post('/advances/:id/recover', validate(schema.recoverAdvance), controller.recoverAdvance);
router.post('/advances/:id/void', validate(schema.voidAdvance), controller.voidAdvance);

router.get('/impress', validate(schema.listImpress), controller.listImpress);
router.post('/impress', validate(schema.createImpress), controller.createImpress);
router.get('/impress/:id', validate(schema.byId), controller.getImpress);
router.patch('/impress/:id', validate(schema.updateImpress), controller.updateImpress);
router.delete('/impress/:id', validate(schema.byId), controller.deleteImpress);
router.post('/impress/:id/void', validate(schema.voidImpress), controller.voidImpress);

router.get('/local-expenses', validate(schema.listLocalExpenses), controller.listLocalExpenses);
router.post('/local-expenses', localExpenseUpload, validate(schema.createLocalExpense), controller.createLocalExpense);
router.get(
  '/local-expenses/employees/:employeeId/site',
  validate(schema.employeeSite),
  controller.employeeRelatedSite
);
router.get('/local-expenses/:id', validate(schema.byId), controller.getLocalExpense);
router.patch('/local-expenses/:id', localExpenseUpload, validate(schema.updateLocalExpense), controller.updateLocalExpense);
router.delete('/local-expenses/:id', validate(schema.byId), controller.deleteLocalExpense);

module.exports = router;
