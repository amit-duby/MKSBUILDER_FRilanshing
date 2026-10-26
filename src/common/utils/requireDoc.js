const AppError = require('../errors/AppError');

async function requireDoc(Model, id, label, filter = {}) {
  const doc = await Model.findOne({ _id: id, ...filter });
  if (!doc) {
    throw new AppError(`${label} not found`, 404, 'NOT_FOUND');
  }
  return doc;
}

module.exports = requireDoc;
