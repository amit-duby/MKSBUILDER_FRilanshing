const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const { assignDefined, containsRegex, parseSort } = require('../../common/utils/helpers');
const { removeStoredCompanyLogo } = require('../../common/middleware/companyUpload');
const Company = require('./company.model');

const repo = new BaseRepository(Company);
const SORT_FIELDS = ['createdAt', 'companyName', 'establishedYear'];

function present(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (json._id && json.id == null) json.id = String(json._id);
  return json;
}

function mergeNested(target, source) {
  if (!source || typeof source !== 'object') return;
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    target[key] = value == null ? '' : value;
  }
}

async function create(body) {
  const doc = await repo.create({
    companyName: body.companyName,
    logo: body.logo || null,
    businessType: body.businessType || '',
    description: body.description || '',
    establishedYear: body.establishedYear,
    contact: body.contact || {},
    registration: body.registration || {},
    registeredAddress: body.registeredAddress || {},
    officeAddress: body.officeAddress || {},
    bankDetails: body.bankDetails || {},
  });
  return present(doc);
}

async function list(query) {
  const filter = {};
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [
      { companyName: pattern },
      { businessType: pattern },
      { description: pattern },
      { 'contact.email': pattern },
      { 'contact.phone': pattern },
      { 'registration.gstin': pattern },
      { 'registration.pan': pattern },
    ];
  }

  const result = await repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS, { createdAt: -1 }),
    lean: true,
  });

  return {
    ...result,
    items: result.items.map(present),
  };
}

async function getById(id) {
  const doc = await Company.findById(id).lean({ virtuals: true });
  if (!doc) throw new AppError('Company not found', 404, 'NOT_FOUND');
  return present(doc);
}

async function update(id, body) {
  const doc = await Company.findById(id);
  if (!doc) throw new AppError('Company not found', 404, 'NOT_FOUND');

  const previousLogo = doc.logo;
  assignDefined(doc, body, [
    'companyName',
    'businessType',
    'description',
    'establishedYear',
  ]);

  if (Object.prototype.hasOwnProperty.call(body, 'logo')) {
    doc.logo = body.logo || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'establishedYear') && body.establishedYear == null) {
    doc.establishedYear = undefined;
  }

  if (body.contact) mergeNested(doc.contact, body.contact);
  if (body.registration) mergeNested(doc.registration, body.registration);
  if (body.registeredAddress) mergeNested(doc.registeredAddress, body.registeredAddress);
  if (body.officeAddress) mergeNested(doc.officeAddress, body.officeAddress);
  if (body.bankDetails) mergeNested(doc.bankDetails, body.bankDetails);

  await doc.save();

  if (
    Object.prototype.hasOwnProperty.call(body, 'logo')
    && previousLogo
    && previousLogo !== doc.logo
  ) {
    removeStoredCompanyLogo(previousLogo);
  }

  return present(doc);
}

async function remove(id) {
  const doc = await Company.findById(id).select('logo');
  if (!doc) throw new AppError('Company not found', 404, 'NOT_FOUND');
  removeStoredCompanyLogo(doc.logo);
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
