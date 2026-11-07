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
  { path: 'employee', select: 'code fullName designation status' },
  { path: 'site', select: 'name code status' },
];

async function getActive(id) {
  const doc = await ImpressAmount.findById(id).populate(POPULATE);
  if (!doc) throw new AppError('Impress amount not found', 404, 'NOT_FOUND');
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

  return getActive(doc.id);
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
  });
}

function getById(id) {
  return getActive(id);
}

async function update(id, body) {
  const doc = await ImpressAmount.findById(id);
  if (!doc) throw new AppError('Impress amount not found', 404, 'NOT_FOUND');

  if (body.employeeId) {
    await assertEmployee(body.employeeId);
    doc.employee = body.employeeId;
  }
  if (body.siteId) {
    await assertSite(body.siteId);
    doc.site = body.siteId;
  }
  if (body.date) doc.date = startOfBusinessDay(body.date);
  assignDefined(doc, body, ['givenTo', 'note']);
  await doc.save();
  return getActive(doc.id);
}

async function remove(id) {
  const doc = await ImpressAmount.findById(id);
  if (!doc) throw new AppError('Impress amount not found', 404, 'NOT_FOUND');
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
