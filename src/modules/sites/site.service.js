const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  containsRegex,
  parseSort,
} = require('../../common/utils/helpers');
const requireDoc = require('../../common/utils/requireDoc');
const Site = require('./site.model');
const Project = require('../projects/project.model');
const Employee = require('../employees/employee.model');
const EmployeeAssignment = require('../employees/assignment.model');

const repo = new BaseRepository(Site);
const SORT_FIELDS = ['name', 'code', 'startDate', 'createdAt', 'status'];
const POPULATE = [
  { path: 'project', select: 'name code status' },
  { path: 'incharge', select: 'fullName code designation status' },
];

async function getActive(id) {
  const doc = await Site.findById(id).populate(POPULATE);
  if (!doc) throw new AppError('Site not found', 404, 'NOT_FOUND');
  return doc;
}

async function assertIncharge(inchargeId) {
  if (!inchargeId) return;
  const employee = await requireDoc(Employee, inchargeId, 'Employee');
  if (employee.status !== 'active') {
    throw new AppError('Site incharge must be an active employee', 400, 'BAD_REQUEST');
  }
}

function assertDates(doc) {
  if (doc.expectedEndDate && doc.startDate && doc.expectedEndDate < doc.startDate) {
    throw new AppError('Expected end date must be on or after the start date', 400, 'BAD_REQUEST');
  }
}

async function create(body) {
  const project = await requireDoc(Project, body.projectId, 'Project');
  if (project.status === 'completed' || project.status === 'cancelled') {
    throw new AppError('Cannot add a site to a completed or cancelled project', 400, 'BAD_REQUEST');
  }
  await assertIncharge(body.inchargeId);

  const site = await repo.create({
    project: project._id,
    code: await nextCode('site', 'STE'),
    name: body.name,
    address: body.address || '',
    city: body.city || '',
    state: body.state || '',
    pincode: body.pincode || '',
    status: body.status || 'active',
    incharge: body.inchargeId,
    startDate: body.startDate,
    expectedEndDate: body.expectedEndDate,
    notes: body.notes || '',
  });

  return getActive(site.id);
}

async function list(query) {
  const filter = {};
  if (query.projectId) filter.project = query.projectId;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ name: pattern }, { code: pattern }, { city: pattern }];
  }

  return repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS),
    populate: POPULATE,
  });
}

async function getById(id) {
  return getActive(id);
}

async function update(id, body) {
  const doc = await Site.findById(id);
  if (!doc) throw new AppError('Site not found', 404, 'NOT_FOUND');

  if (Object.prototype.hasOwnProperty.call(body, 'inchargeId')) {
    if (body.inchargeId) await assertIncharge(body.inchargeId);
    doc.incharge = body.inchargeId || undefined;
  }

  assignDefined(doc, body, [
    'name',
    'address',
    'city',
    'state',
    'pincode',
    'status',
    'startDate',
    'expectedEndDate',
    'notes',
  ]);
  assertDates(doc);
  await doc.save();

  return getActive(doc.id);
}

async function remove(id) {
  const doc = await Site.findById(id);
  if (!doc) throw new AppError('Site not found', 404, 'NOT_FOUND');
  await EmployeeAssignment.deleteMany({ site: doc._id });
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
