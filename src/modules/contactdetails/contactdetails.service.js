const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const { assignDefined, containsRegex, parseSort } = require('../../common/utils/helpers');
const ContactDetails = require('./contactdetails.model');

const repo = new BaseRepository(ContactDetails);
const SORT_FIELDS = ['createdAt', 'email', 'firstPhone'];

function present(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (json._id && json.id == null) json.id = String(json._id);
  return json;
}

async function create(body) {
  const doc = await repo.create({
    firstPhone: body.firstPhone,
    email: body.email.toLowerCase(),
    secondPhone: body.secondPhone || null,
    address: body.address,
  });
  return present(doc);
}

async function list(query) {
  const filter = {};
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [
      { firstPhone: pattern },
      { secondPhone: pattern },
      { email: pattern },
      { address: pattern },
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

async function update(id, body) {
  const doc = await ContactDetails.findById(id);
  if (!doc) throw new AppError('Contact details not found', 404, 'NOT_FOUND');

  assignDefined(doc, body, ['firstPhone', 'email', 'secondPhone', 'address']);
  if (Object.prototype.hasOwnProperty.call(body, 'email') && body.email) {
    doc.email = body.email.toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(body, 'secondPhone') && !body.secondPhone) {
    doc.secondPhone = null;
  }

  await doc.save();
  return present(doc);
}

async function remove(id) {
  const doc = await ContactDetails.findById(id).select('_id');
  if (!doc) throw new AppError('Contact details not found', 404, 'NOT_FOUND');
  await doc.deleteOne();
}

module.exports = { create, list, update, remove };
