const express = require('express');
const validate = require('../../common/middleware/validate');
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

module.exports = router;
