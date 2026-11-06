const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const { nextCode } = require('../../common/utils/sequence');
const { assignDefined, containsRegex, parseSort } = require('../../common/utils/helpers');
const Department = require('./department.model');
const Employee = require('../employees/employee.model');

const repo = new BaseRepository(Department);
const SORT_FIELDS = ['name', 'code', 'createdAt'];

async function getActive(id) {
  const doc = await repo.findById(id);
  if (!doc) throw new AppError('Department not found', 404, 'NOT_FOUND');
  return doc;
}

async function withHeadcount(doc) {
  const json = doc.toJSON();
  json.activeEmployeeCount = await Employee.countDocuments({
    department: doc._id,
    status: 'active',
  });
  return json;
}

async function create(body) {
  return repo.create({
    code: await nextCode('department', 'DEP'),
    name: body.name,
    description: body.description || '',
    isActive: body.isActive !== false,
  });
}

async function list(query) {
  const filter = {};
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
  return withHeadcount(await getActive(id));
}

async function update(id, body) {
  const doc = await getActive(id);

  if (body.isActive === false) {
    const activeEmployees = await Employee.exists({
      department: doc._id,
      status: 'active',
    });
    if (activeEmployees) {
      throw new AppError(
        'Reassign active employees before deactivating this department',
        409,
        'CONFLICT'
      );
    }
  }

  assignDefined(doc, body, ['name', 'description', 'isActive']);
  await doc.save();
  return doc;
}

async function remove(id) {
  const doc = await getActive(id);
  const inUse = await Employee.exists({ department: doc._id });
  if (inUse) {
    throw new AppError('Reassign employees before deleting this department', 409, 'CONFLICT');
  }
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
