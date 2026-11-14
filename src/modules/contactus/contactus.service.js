const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const { containsRegex, parseSort } = require('../../common/utils/helpers');
const ContactUs = require('./contactus.model');

const repo = new BaseRepository(ContactUs);
const SORT_FIELDS = ['createdAt', 'name', 'email', 'projectType'];

function present(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (json._id && json.id == null) json.id = String(json._id);
  return json;
}

async function create(body) {
  const doc = await repo.create({
    name: body.name,
    email: body.email.toLowerCase(),
    phone: body.phone,
    projectType: body.projectType,
    details: body.details,
  });
  return present(doc);
}

async function list(query) {
  const filter = {};
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [
      { name: pattern },
      { email: pattern },
      { phone: pattern },
      { projectType: pattern },
      { details: pattern },
    ];
  }
  if (query.projectType) {
    filter.projectType = containsRegex(query.projectType);
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

async function remove(id) {
  const doc = await ContactUs.findById(id).select('_id');
  if (!doc) throw new AppError('Contact request not found', 404, 'NOT_FOUND');
  await doc.deleteOne();
}

module.exports = { create, list, remove };
