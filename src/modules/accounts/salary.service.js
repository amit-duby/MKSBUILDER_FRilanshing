const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { parseSort, containsRegex } = require('../../common/utils/helpers');
const { resolveProjectSite } = require('../../common/utils/projectSite');
const Employee = require('../employees/employee.model');
const SalaryRecord = require('./salary.model');
const { computeSalary } = require('./salaryMath');
const { assertSalaryPatchAllowed } = require('./salaryLock');

const SORT_FIELDS = ['periodYear', 'periodMonth', 'code', 'createdAt', 'netAmount'];
const POPULATE = [
  { path: 'employee', select: 'fullName code designation status' },
  { path: 'project', select: 'name code' },
  { path: 'site', select: 'name code' },
];

function withLinks(query) {
  return query.populate(POPULATE);
}

async function present(id) {
  const doc = await withLinks(SalaryRecord.findById(id));
  if (!doc) throw new AppError('Salary record not found', 404, 'NOT_FOUND');
  return doc;
}

function applyTotals(doc, totals) {
  doc.baseAmount = totals.baseAmount;
  doc.allowances = totals.allowances;
  doc.deductions = totals.deductions;
  doc.extras = totals.extras;
  doc.grossAmount = totals.grossAmount;
  doc.totalDeductions = totals.totalDeductions;
  doc.totalExtras = totals.totalExtras;
  doc.netAmount = totals.netAmount;
  doc.amountPaid = totals.amountPaid;
  doc.balanceAmount = totals.balanceAmount;
  doc.outstandingAmount = totals.outstandingAmount;
  doc.overpaidAmount = totals.overpaidAmount;
}

async function create(body, user) {
  const employee = await requireDoc(Employee, body.employeeId, 'Employee', { isDeleted: false });
  const links = await resolveProjectSite(body.projectId, body.siteId);
  const baseAmount = body.baseAmount !== undefined ? body.baseAmount : employee.salary.baseAmount;
  if (baseAmount === undefined || baseAmount === null) {
    throw new AppError('Base salary is required', 400, 'BAD_REQUEST');
  }
  const totals = computeSalary({
    baseAmount,
    allowances: body.allowances !== undefined ? body.allowances : employee.salary.allowances,
    deductions: body.deductions || [],
    extras: body.extras || [],
    amountPaid: body.amountPaid || 0,
  });

  const doc = await SalaryRecord.create({
    code: await nextCode('salary', 'SAL'),
    employee: employee._id,
    project: links.projectId,
    site: links.site ? links.site._id : undefined,
    periodMonth: body.periodMonth,
    periodYear: body.periodYear,
    payBasis: body.payBasis || employee.salary.payBasis || 'monthly',
    recordStatus: body.recordStatus || 'draft',
    remarks: body.remarks || '',
    createdBy: user && user.id,
    isVoid: false,
    ...totals,
  });

  return present(doc.id);
}

async function list(query) {
  const filter = {};
  if (!query.includeVoid) filter.isVoid = false;
  if (query.employeeId) filter.employee = query.employeeId;
  if (query.projectId) filter.project = query.projectId;
  if (query.periodMonth) filter.periodMonth = query.periodMonth;
  if (query.periodYear) filter.periodYear = query.periodYear;
  if (query.recordStatus) filter.recordStatus = query.recordStatus;
  if (query.search) filter.code = containsRegex(query.search);

  return new BaseRepository(SalaryRecord).paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS, { periodYear: -1, periodMonth: -1 }),
    populate: POPULATE,
  });
}

function getById(id) {
  return present(id);
}

async function update(id, body) {
  const doc = await SalaryRecord.findById(id);
  if (!doc || doc.isVoid) throw new AppError('Salary record not found', 404, 'NOT_FOUND');

  assertSalaryPatchAllowed(doc.recordStatus, body);

  const reopening = doc.recordStatus === 'recorded' && body.recordStatus === 'draft';
  if (!reopening && doc.recordStatus !== 'recorded') {
    const links = await resolveProjectSite(
      body.projectId !== undefined ? body.projectId : doc.project,
      body.siteId !== undefined ? body.siteId : doc.site
    );
    doc.project = links.projectId;
    doc.site = links.site ? links.site._id : undefined;
    if (body.periodMonth !== undefined) doc.periodMonth = body.periodMonth;
    if (body.periodYear !== undefined) doc.periodYear = body.periodYear;
    if (body.payBasis) doc.payBasis = body.payBasis;
  }

  const totals = computeSalary({
    baseAmount: body.baseAmount !== undefined ? body.baseAmount : doc.baseAmount,
    allowances: body.allowances !== undefined ? body.allowances : doc.allowances,
    deductions: body.deductions !== undefined ? body.deductions : doc.deductions,
    extras: body.extras !== undefined ? body.extras : doc.extras,
    amountPaid: body.amountPaid !== undefined ? body.amountPaid : doc.amountPaid,
  });
  applyTotals(doc, totals);

  if (body.recordStatus) doc.recordStatus = body.recordStatus;
  if (body.remarks !== undefined) doc.remarks = body.remarks;
  await doc.save();
  return present(doc.id);
}

async function voidRecord(id, body) {
  const doc = await SalaryRecord.findById(id);
  if (!doc || doc.isVoid) throw new AppError('Salary record not found', 404, 'NOT_FOUND');
  doc.isVoid = true;
  doc.voidReason = body.reason;
  doc.voidedAt = new Date();
  await doc.save();
  return present(doc.id);
}

module.exports = { create, list, getById, update, voidRecord };
