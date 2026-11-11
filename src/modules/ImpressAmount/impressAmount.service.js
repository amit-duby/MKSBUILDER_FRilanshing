const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  containsRegex,
  parseSort,
  startOfBusinessDay,
  endOfUtcDay,
} = require('../../common/utils/helpers');
const ImpressAmount = require('./impressAmount.model');
const Employee = require('../employees/employee.model');
const Site = require('../sites/site.model');

const repo = new BaseRepository(ImpressAmount);
const SORT_FIELDS = ['date', 'code', 'createdAt', 'givenTo'];
const POPULATE = [
  { path: 'employee', select: 'code fullName designation status profilePhoto' },
  { path: 'site', select: 'name code status' },
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

function present(doc, employee, site) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (employee) {
    json.employee = briefRef(employee, ['code', 'fullName', 'designation', 'status', 'profilePhoto']);
  }
  if (site) json.site = briefRef(site, ['name', 'code', 'status']);
  return json;
}

async function getActive(id) {
  const doc = await ImpressAmount.findById(id).populate(POPULATE).lean({ virtuals: true });
  if (!doc) throw new AppError('Impress amount not found', 404, 'NOT_FOUND');
  if (doc._id && doc.id == null) doc.id = String(doc._id);
  return doc;
}

async function assertEmployee(employeeId) {
  return requireDoc(Employee, employeeId, 'Employee');
}

async function assertSite(siteId) {
  return requireDoc(Site, siteId, 'Site');
}

async function create(body) {
  const [employee, site, code] = await Promise.all([
    assertEmployee(body.employeeId),
    assertSite(body.siteId),
    nextCode('impressAmount', 'IMP'),
  ]);

  const doc = await repo.create({
    code,
    date: startOfBusinessDay(body.date),
    employee: employee._id,
    givenTo: body.givenTo,
    site: site._id,
    note: body.note || '',
  });

  return present(doc, employee, site);
}

async function list(query) {
  const filter = {};
  if (query.employeeId) filter.employee = query.employeeId;
  if (query.siteId) filter.site = query.siteId;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = startOfBusinessDay(query.from);
    if (query.to) filter.date.$lte = endOfUtcDay(startOfBusinessDay(query.to));
  }
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ code: pattern }, { givenTo: pattern }, { note: pattern }];
  }

  return repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS, { date: -1 }),
    populate: POPULATE,
    lean: true,
  });
}

function getById(id) {
  return getActive(id);
}

async function update(id, body) {
  const doc = await ImpressAmount.findById(id);
  if (!doc) throw new AppError('Impress amount not found', 404, 'NOT_FOUND');

  const tasks = [];
  if (body.employeeId) tasks.push(assertEmployee(body.employeeId).then((employee) => {
    doc.employee = employee._id;
    return ['employee', employee];
  }));
  if (body.siteId) tasks.push(assertSite(body.siteId).then((site) => {
    doc.site = site._id;
    return ['site', site];
  }));

  const resolved = Object.fromEntries(await Promise.all(tasks));
  if (body.date) doc.date = startOfBusinessDay(body.date);
  assignDefined(doc, body, ['givenTo', 'note']);
  await doc.save();

  return present(doc, resolved.employee, resolved.site);
}

async function remove(id) {
  const doc = await ImpressAmount.findById(id).select('_id');
  if (!doc) throw new AppError('Impress amount not found', 404, 'NOT_FOUND');
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
