const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  containsRegex,
  escapeRegex,
  parseSort,
} = require('../../common/utils/helpers');
const MaintenanceCategory = require('./maintenanceCategory.model');
const Maintenance = require('./maintenance.model');

const repo = new BaseRepository(MaintenanceCategory);
const SORT_FIELDS = ['name', 'code', 'createdAt'];

async function getActive(id) {
  const doc = await repo.findById(id);
  if (!doc) throw new AppError('Maintenance category not found', 404, 'NOT_FOUND');
  return doc;
}

async function assertUniqueName(name, excludeId) {
  const filter = {
    name: new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i'),
  };
  if (excludeId) filter._id = { $ne: excludeId };
  const exists = await MaintenanceCategory.exists(filter);
  if (exists) {
    throw new AppError('A maintenance category with this name already exists', 409, 'CONFLICT');
  }
}

async function create(body) {
  await assertUniqueName(body.name);
  return repo.create({
    code: await nextCode('maintenanceCategory', 'MCAT'),
    name: body.name,
    description: body.description || '',
    isActive: body.isActive !== false,
  });
}

async function list(query) {
  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive;
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ name: pattern }, { code: pattern }];
  }

  return repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS),
  });
}

async function getById(id) {
  return getActive(id);
}

async function update(id, body) {
  const doc = await getActive(id);
  if (body.name && body.name.trim().toLowerCase() !== doc.name.toLowerCase()) {
    await assertUniqueName(body.name, doc._id);
  }
  assignDefined(doc, body, ['name', 'description', 'isActive']);
  await doc.save();
  return doc;
}

async function remove(id) {
  const doc = await repo.findById(id);
  if (!doc) throw new AppError('Maintenance category not found', 404, 'NOT_FOUND');
  const inUse = await Maintenance.exists({ category: doc._id });
  if (inUse) {
    throw new AppError('Reassign maintenance logs before deleting this category', 409, 'CONFLICT');
  }
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
