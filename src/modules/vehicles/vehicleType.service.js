const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const { assignDefined, containsRegex, parseSort } = require('../../common/utils/helpers');
const VehicleType = require('./vehicleType.model');
const Vehicle = require('./vehicle.model');

const repo = new BaseRepository(VehicleType);
const SORT_FIELDS = ['name', 'createdAt', 'status'];

async function getActive(id) {
  const doc = await repo.findById(id);
  if (!doc) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
  return doc;
}

async function create(body) {
  return repo.create({
    name: body.name,
    description: body.description || '',
    status: body.status || 'active',
  });
}

async function list(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ name: pattern }, { description: pattern }];
  }

  return repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS),
  });
}

function getById(id) {
  return getActive(id);
}

async function update(id, body) {
  const doc = await getActive(id);
  assignDefined(doc, body, ['name', 'description', 'status']);
  await doc.save();
  return doc;
}

async function remove(id) {
  const doc = await getActive(id);
  const inUse = await Vehicle.exists({ vehicleType: doc._id });
  if (inUse) {
    throw new AppError('Vehicle type is used by one or more vehicles', 409, 'CONFLICT');
  }
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
