/* One-off timing probe for employee create / get / update DB steps. */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { nextCode } = require('../src/common/utils/sequence');
const Employee = require('../src/modules/employees/employee.model');
const Assignment = require('../src/modules/employees/assignment.model');
const Department = require('../src/modules/departments/department.model');
const employeeService = require('../src/modules/employees/employee.service');

function ms(start) {
  return Number((process.hrtime.bigint() - start) / 1000000n);
}

async function timed(label, fn, bag) {
  const start = process.hrtime.bigint();
  const value = await fn();
  bag.push({ step: label, ms: ms(start) });
  return value;
}

async function main() {
  await connectDatabase(process.env.MONGODB_URI);

  const deptStart = process.hrtime.bigint();
  const department = await Department.findOne({ isActive: true }).select('_id name code isActive').lean();
  console.log(`find active department: ${ms(deptStart)}ms`);
  if (!department) throw new Error('No active department found');

  const createBag = [];
  const totalCreate = process.hrtime.bigint();

  const [deptDoc, code] = await timed('create.parallel department+nextCode', async () => Promise.all([
    Department.findById(department._id).select('name code isActive').lean(),
    nextCode('employee', 'EMP'),
  ]), createBag);

  const employee = await timed('create.Employee.create', () => Employee.create({
    code,
    fullName: `Bench Emp ${Date.now()}`,
    department: department._id,
    designation: 'Bench',
    category: 'Test',
    employmentType: 'permanent',
    status: 'active',
    joiningDate: new Date(),
    salary: { payBasis: 'monthly', baseAmount: 10000, allowances: [] },
  }), createBag);

  createBag.push({ step: 'create.TOTAL', ms: ms(totalCreate) });

  const getBag = [];
  const totalGet = process.hrtime.bigint();
  const doc = await timed('get.findById+populate department', () => (
    Employee.findById(employee._id).populate({ path: 'department', select: 'name code isActive' })
  ), getBag);
  await timed('get.loadCurrentAssignments', () => Assignment.find({
    employee: employee._id,
    isCurrent: true,
  }).populate('site', 'name code status project').sort({ startDate: -1 }), getBag);
  doc.toJSON();
  getBag.push({ step: 'get.TOTAL', ms: ms(totalGet) });

  const updateBag = [];
  const totalUpdate = process.hrtime.bigint();
  const editable = await timed('update.findById', () => Employee.findById(employee._id), updateBag);
  editable.designation = 'Bench Updated';
  await timed('update.save', () => editable.save(), updateBag);
  await timed('update.populate department', () => editable.populate({
    path: 'department',
    select: 'name code isActive',
  }), updateBag);
  await timed('update.loadCurrentAssignments', () => Assignment.find({
    employee: employee._id,
    isCurrent: true,
  }).populate('site', 'name code status project').sort({ startDate: -1 }), updateBag);
  updateBag.push({ step: 'update.TOTAL', ms: ms(totalUpdate) });

  console.log('\nCREATE step breakdown (sequential probe)');
  for (const row of createBag) console.log(`  ${row.ms.toString().padStart(6)} ms  ${row.step}`);
  console.log('\nGET step breakdown (sequential probe)');
  for (const row of getBag) console.log(`  ${row.ms.toString().padStart(6)} ms  ${row.step}`);
  console.log('\nUPDATE step breakdown (sequential probe)');
  for (const row of updateBag) console.log(`  ${row.ms.toString().padStart(6)} ms  ${row.step}`);

  const live = [];
  await timed('service.getById TOTAL', () => employeeService.getById(employee.id), live);
  await timed('service.update TOTAL', () => employeeService.update(employee.id, {
    designation: 'Bench Live',
  }), live);
  console.log('\nLIVE service totals (optimized code)');
  for (const row of live) console.log(`  ${row.ms.toString().padStart(6)} ms  ${row.step}`);
  console.log(`\nDepartment used: ${deptDoc.code} / ${department._id}`);

  await Employee.deleteOne({ _id: employee._id });
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error(error);
  try { await disconnectDatabase(); } catch (_) { /* ignore */ }
  process.exit(1);
});
