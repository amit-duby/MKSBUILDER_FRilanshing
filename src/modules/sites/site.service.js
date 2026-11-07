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
const StockLocation = require('../inventory/location.model');
const StockBalance = require('../inventory/balance.model');
const EmployeeAssignment = require('../employees/assignment.model');

const repo = new BaseRepository(Site);
const SORT_FIELDS = ['name', 'code', 'startDate', 'createdAt', 'status'];
const POPULATE = [
  { path: 'project', select: 'name code status' },
  { path: 'incharge', select: 'fullName code designation status' },
];

function briefRef(doc, fields) {
  if (!doc) return null;
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const out = { id: json.id || String(json._id) };
  for (const field of fields) {
    if (json[field] !== undefined) out[field] = json[field];
  }
  return out;
}

function present(doc, project, incharge) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (project) json.project = briefRef(project, ['name', 'code', 'status']);
  if (incharge !== undefined) {
    json.incharge = incharge
      ? briefRef(incharge, ['fullName', 'code', 'designation', 'status'])
      : null;
  }
  return json;
}

async function getActive(id) {
  const doc = await Site.findById(id).populate(POPULATE).lean({ virtuals: true });
  if (!doc) throw new AppError('Site not found', 404, 'NOT_FOUND');
  if (doc._id && doc.id == null) doc.id = String(doc._id);
  return doc;
}

async function assertIncharge(inchargeId) {
  if (!inchargeId) return null;
  const employee = await requireDoc(Employee, inchargeId, 'Employee');
  if (employee.status !== 'active') {
    throw new AppError('Site incharge must be an active employee', 400, 'BAD_REQUEST');
  }
  return employee;
}

function assertDates(doc) {
  if (doc.expectedEndDate && doc.startDate && doc.expectedEndDate < doc.startDate) {
    throw new AppError('Expected end date must be on or after the start date', 400, 'BAD_REQUEST');
  }
}

async function create(body) {
  const [project, incharge, code] = await Promise.all([
    requireDoc(Project, body.projectId, 'Project'),
    assertIncharge(body.inchargeId),
    nextCode('site', 'STE'),
  ]);

  if (project.status === 'completed' || project.status === 'cancelled') {
    throw new AppError('Cannot add a site to a completed or cancelled project', 400, 'BAD_REQUEST');
  }

  const site = await repo.create({
    project: project._id,
    code,
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

  return present(site, project, incharge);
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
    lean: true,
  });
}

function getById(id) {
  return getActive(id);
}

async function update(id, body) {
  const doc = await Site.findById(id);
  if (!doc) throw new AppError('Site not found', 404, 'NOT_FOUND');

  let incharge;
  if (Object.prototype.hasOwnProperty.call(body, 'inchargeId')) {
    incharge = body.inchargeId ? await assertIncharge(body.inchargeId) : null;
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
      { site: doc._id },
      { $set: { name: `${doc.name} Store`.slice(0, 120) } }
    );
  }

  return present(doc, undefined, incharge);
}

async function assertStockClear(siteId) {
  const location = await StockLocation.findOne({ site: siteId });
  if (!location) return null;

  const remaining = await StockBalance.exists({ location: location._id, quantity: { $gt: 0 } });
  if (remaining) {
    throw new AppError('Transfer remaining site stock before deleting this site', 409, 'CONFLICT');
  }
  return location;
}

async function remove(id) {
  const doc = await Site.findById(id).select('_id');
  if (!doc) throw new AppError('Site not found', 404, 'NOT_FOUND');

  const location = await assertStockClear(doc._id);
  if (location) await location.deleteOne();

  await EmployeeAssignment.deleteMany({ site: doc._id });
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
