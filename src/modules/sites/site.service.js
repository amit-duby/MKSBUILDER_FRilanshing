const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  archivedFilter,
  containsRegex,
  parseSort,
} = require('../../common/utils/helpers');
const requireDoc = require('../../common/utils/requireDoc');
const Site = require('./site.model');
const Project = require('../projects/project.model');
const Employee = require('../employees/employee.model');
const StockLocation = require('../inventory/location.model');
const StockBalance = require('../inventory/balance.model');
const EmployeeAssignment = require('../employees/assignment.model');

const repo = new BaseRepository(Site);
const SORT_FIELDS = ['name', 'code', 'startDate', 'createdAt', 'status'];
const POPULATE = [
  { path: 'project', select: 'name code status' },
  { path: 'incharge', select: 'fullName code designation status' },
];

async function getActive(id) {
  const doc = await Site.findById(id).populate(POPULATE);
  if (!doc || doc.isDeleted) throw new AppError('Site not found', 404, 'NOT_FOUND');
  return doc;
}

async function assertIncharge(inchargeId) {
  if (!inchargeId) return;
  const employee = await requireDoc(Employee, inchargeId, 'Employee', { isDeleted: false });
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
  const project = await requireDoc(Project, body.projectId, 'Project', { isDeleted: false });
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

  try {
    await StockLocation.create({
      code: await nextCode('stock_location', 'LOC'),
      name: `${site.name} Store`.slice(0, 120),
      type: 'site_store',
      site: site._id,
      isSystem: false,
      isActive: true,
    });
  } catch (error) {
    await Site.deleteOne({ _id: site._id });
    throw error;
  }

  return getActive(site.id);
}

async function list(query) {
  const filter = { ...archivedFilter(query) };
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
  if (!doc || doc.isDeleted) throw new AppError('Site not found', 404, 'NOT_FOUND');

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

  if (body.name) {
    await StockLocation.updateOne(
      { site: doc._id, isDeleted: false },
      { $set: { name: `${doc.name} Store`.slice(0, 120) } }
    );
  }

  return getActive(doc.id);
}

async function assertStockClear(siteId) {
  const location = await StockLocation.findOne({ site: siteId, isDeleted: false });
  if (!location) return null;

  const remaining = await StockBalance.exists({ location: location._id, quantity: { $gt: 0 } });
  if (remaining) {
    throw new AppError('Transfer remaining site stock before archiving this site', 409, 'CONFLICT');
  }
  return location;
}

async function remove(id) {
  const doc = await Site.findById(id);
  if (!doc || doc.isDeleted) throw new AppError('Site not found', 404, 'NOT_FOUND');

  const location = await assertStockClear(doc._id);
  if (location) {
    location.isActive = false;
    location.isDeleted = true;
    await location.save();
  }

  await EmployeeAssignment.updateMany(
    { site: doc._id, isCurrent: true },
    { $set: { isCurrent: false, endDate: new Date() } }
  );

  doc.isDeleted = true;
  doc.status = 'inactive';
  await doc.save();
}

async function restore(id) {
  const doc = await Site.findById(id);
  if (!doc) throw new AppError('Site not found', 404, 'NOT_FOUND');
  if (!doc.isDeleted) throw new AppError('Site is already active', 400, 'BAD_REQUEST');

  const project = await requireDoc(Project, doc.project, 'Project', { isDeleted: false });
  if (project.status === 'completed' || project.status === 'cancelled') {
    throw new AppError('Restore the project before restoring this site', 409, 'CONFLICT');
  }

  doc.isDeleted = false;
  doc.status = 'active';
  await doc.save();

  const location = await StockLocation.findOne({ site: doc._id });
  if (location) {
    location.isDeleted = false;
    location.isActive = true;
    await location.save();
  } else {
    await StockLocation.create({
      code: await nextCode('stock_location', 'LOC'),
      name: `${doc.name} Store`.slice(0, 120),
      type: 'site_store',
      site: doc._id,
      isActive: true,
    });
  }

  return getActive(doc.id);
}

module.exports = { create, list, getById, update, remove, restore };
