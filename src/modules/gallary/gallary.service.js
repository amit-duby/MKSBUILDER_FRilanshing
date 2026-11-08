const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const {
  assignDefined,
  containsRegex,
  parseSort,
  startOfBusinessDay,
  endOfUtcDay,
} = require('../../common/utils/helpers');
const { removeStoredGallaryImage } = require('../../common/middleware/gallaryUpload');
const Gallary = require('./gallary.model');

const repo = new BaseRepository(Gallary);
const SORT_FIELDS = ['date', 'name', 'createdAt'];

function present(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (json._id && json.id == null) json.id = String(json._id);
  return json;
}

async function getActive(id) {
  const doc = await Gallary.findById(id).lean({ virtuals: true });
  if (!doc) throw new AppError('Gallary item not found', 404, 'NOT_FOUND');
  return present(doc);
}

async function create(body) {
  const doc = await repo.create({
    name: body.name,
    date: startOfBusinessDay(body.date),
    description: body.description || '',
    image: body.image || null,
  });
  return present(doc);
}

async function list(query) {
  const filter = {};
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = startOfBusinessDay(query.from);
    if (query.to) filter.date.$lte = endOfUtcDay(startOfBusinessDay(query.to));
  }
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ name: pattern }, { description: pattern }];
  }

  const result = await repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS, { date: -1 }),
    lean: true,
  });

  return {
    ...result,
    items: result.items.map(present),
  };
}

function getById(id) {
  return getActive(id);
}

async function update(id, body) {
  const doc = await Gallary.findById(id);
  if (!doc) throw new AppError('Gallary item not found', 404, 'NOT_FOUND');

  const previousImage = doc.image;
  const patch = { ...body };
  if (patch.date) patch.date = startOfBusinessDay(patch.date);

  assignDefined(doc, patch, ['name', 'date', 'description']);
  if (Object.prototype.hasOwnProperty.call(patch, 'image')) {
    doc.image = patch.image || null;
  }
  await doc.save();

  if (
    Object.prototype.hasOwnProperty.call(patch, 'image')
    && previousImage
    && previousImage !== doc.image
  ) {
    removeStoredGallaryImage(previousImage);
  }

  return present(doc);
}

async function remove(id) {
  const doc = await Gallary.findById(id).select('image');
  if (!doc) throw new AppError('Gallary item not found', 404, 'NOT_FOUND');
  removeStoredGallaryImage(doc.image);
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
