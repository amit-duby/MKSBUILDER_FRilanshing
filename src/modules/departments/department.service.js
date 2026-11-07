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
  const [doc, activeEmployeeCount] = await Promise.all([
    Department.findById(id).lean({ virtuals: true }),
    Employee.countDocuments({ department: id, status: 'active' }),
  ]);
  if (!doc) throw new AppError('Department not found', 404, 'NOT_FOUND');
  if (doc._id && doc.id == null) doc.id = String(doc._id);
  doc.activeEmployeeCount = activeEmployeeCount;
  return doc;
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
  const [doc, inUse] = await Promise.all([
    getActive(id),
    Employee.exists({ department: id }),
  ]);
  if (inUse) {
    throw new AppError('Reassign employees before deleting this department', 409, 'CONFLICT');
  }
  await doc.deleteOne();
}

module.exports = { create, list, getById, update, remove };
