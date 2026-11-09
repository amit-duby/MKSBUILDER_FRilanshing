const AppError = require('../../common/errors/AppError');
const { assignDefined, containsRegex, parseSort } = require('../../common/utils/helpers');
const VehicleType = require('./vehicleType.model');
const Vehicle = require('./vehicle.model');

const SORT_FIELDS = ['name', 'createdAt', 'status'];
const LIST_CACHE_TTL_MS = 60_000;
const listCache = new Map();

function listCacheKey(query = {}) {
  return JSON.stringify({
    page: query.page || 1,
    limit: query.limit || 20,
    sort: query.sort || null,
    status: query.status || null,
    search: query.search || null,
  });
}

function getCachedList(query) {
  const key = listCacheKey(query);
  const entry = listCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    listCache.delete(key);
    return null;
  }
  return {
    items: entry.value.items,
    meta: { ...entry.value.meta },
  };
}

function setCachedList(query, value) {
  listCache.set(listCacheKey(query), {
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
    value: {
      items: value.items,
      meta: { ...value.meta },
    },
  });
}

function clearListCache() {
  listCache.clear();
}

function presentType(doc) {
  return {
    id: String(doc.id || doc._id),
    name: doc.name,
    description: doc.description || '',
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function getActive(id) {
  const doc = await VehicleType.findById(id);
  if (!doc) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
  return doc;
}

async function create(body) {
  const doc = await VehicleType.create({
    name: body.name,
    description: body.description || '',
    status: body.status || 'active',
  });
  clearListCache();
  return doc;
}

async function list(query) {
  const cached = getCachedList(query);
  if (cached) return cached;

  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;
  const sort = parseSort(query.sort, SORT_FIELDS);

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ name: pattern }, { description: pattern }];
  }

  const [facet = {}] = await VehicleType.aggregate([
    { $match: filter },
    {
      $facet: {
        items: [
          { $sort: sort },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              name: 1,
              description: 1,
              status: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const total = facet.total && facet.total[0] ? facet.total[0].count : 0;
  const result = {
    items: (facet.items || []).map(presentType),
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / limit),
    },
  };

  setCachedList(query, result);
  return result;
}

function getById(id) {
  return getActive(id);
}

async function update(id, body) {
  const doc = await getActive(id);
  assignDefined(doc, body, ['name', 'description', 'status']);
  await doc.save();
  clearListCache();
  return doc;
}

async function remove(id) {
  const doc = await getActive(id);
  const inUse = await Vehicle.exists({ vehicleType: doc._id });
  if (inUse) {
    throw new AppError('Vehicle type is used by one or more vehicles', 409, 'CONFLICT');
  }
  await doc.deleteOne();
  clearListCache();
}

module.exports = { create, list, getById, update, remove };
