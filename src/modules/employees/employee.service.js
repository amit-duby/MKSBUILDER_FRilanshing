const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  archivedFilter,
  containsRegex,
  parseSort,
} = require('../../common/utils/helpers');
const Employee = require('./employee.model');
const Assignment = require('./assignment.model');
const Department = require('../departments/department.model');
const Site = require('../sites/site.model');

const repo = new BaseRepository(Employee);
const SORT_FIELDS = ['fullName', 'code', 'joiningDate', 'createdAt', 'designation'];
const POPULATE = [
  { path: 'department', select: 'name code isActive' },
  { path: 'site', select: 'name code status project' },
];

async function getActive(id) {
  const doc = await Employee.findById(id).populate(POPULATE);
  if (!doc || doc.isDeleted) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  return doc;
}

async function assertDepartment(departmentId) {
  const department = await requireDoc(Department, departmentId, 'Department', { isDeleted: false });
  if (!department.isActive) {
    throw new AppError('Department is inactive', 400, 'BAD_REQUEST');
  }
  return department;
}

function assertEmploymentDates(doc) {
  if (doc.relievingDate && doc.joiningDate && doc.relievingDate < doc.joiningDate) {
    throw new AppError('Relieving date must be on or after the joining date', 400, 'BAD_REQUEST');
  }
  if (doc.status === 'resigned' && !doc.relievingDate) {
    throw new AppError('Relieving date is required when an employee resigns', 400, 'BAD_REQUEST');
  }
}

function presentDepartment(department) {
  return {
    id: department.id,
    name: department.name,
    code: department.code,
    isActive: department.isActive,
  };
}

function presentAssignment(assignment, site) {
  const json = assignment.toJSON();
  json.site = {
    id: site.id,
    name: site.name,
    code: site.code,
    status: site.status,
    project: site.project,
  };
  return json;
}

async function closeCurrentAssignments(employeeId, endDate) {
  await Assignment.updateMany(
    { employee: employeeId, isCurrent: true },
    { $set: { isCurrent: false, endDate: endDate || new Date() } }
  );
}

async function assignToSite(employee, siteId, startDate, remarks) {
  if (employee.status !== 'active') {
    throw new AppError('Only active employees can be assigned to a site', 400, 'BAD_REQUEST');
  }

  const site = await requireDoc(Site, siteId, 'Site', { isDeleted: false });
  if (site.status !== 'active') {
    throw new AppError('Employees can only be assigned to an active site', 400, 'BAD_REQUEST');
  }

  const existing = await Assignment.findOne({
    employee: employee._id,
    site: site._id,
    isCurrent: true,
  });
  if (existing) {
    throw new AppError('This employee is already assigned to the site', 409, 'CONFLICT');
  }

  const assignmentStart = startDate || new Date();
  if (assignmentStart < employee.joiningDate) {
    throw new AppError('Assignment cannot start before the joining date', 400, 'BAD_REQUEST');
  }

  const assignment = await Assignment.create({
    employee: employee._id,
    site: site._id,
    startDate: assignmentStart,
    isCurrent: true,
    remarks: remarks || '',
  });
  return { assignment, site };
}

async function create(body) {
  if (body.status === 'resigned') {
    throw new AppError('Create the employee as active, then mark them resigned', 400, 'BAD_REQUEST');
  }

  const [department, code] = await Promise.all([
    assertDepartment(body.departmentId),
    nextCode('employee', 'EMP'),
  ]);

  const employee = await repo.create({
    code,
    fullName: body.fullName,
    phone: body.phone,
    email: body.email ? body.email.toLowerCase() : undefined,
    address: body.address || '',
    department: body.departmentId,
    designation: body.designation,
    idType: body.idType || '',
    idNumber: body.idNumber || null,
    profilePhoto: body.profilePhoto || null,
    idPhotos: body.idPhotos || [],
    site: body.siteId || null,
    bankName: body.bankName || '',
    accountNumber: body.accountNumber || '',
    ifscCode: body.ifscCode || '',
    employmentType: body.employmentType,
    status: body.status || 'active',
    joiningDate: body.joiningDate,
    relievingDate: body.relievingDate,
    salary: {
      payBasis: body.salary.payBasis || 'monthly',
      baseAmount: body.salary.baseAmount,
      allowances: body.salary.allowances || [],
    },
    notes: body.notes || '',
  });

  const currentAssignments = [];
  if (body.siteId) {
    try {
      const assigned = await assignToSite(employee, body.siteId, body.joiningDate);
      currentAssignments.push(presentAssignment(assigned.assignment, assigned.site));
    } catch (error) {
      await Employee.deleteOne({ _id: employee._id });
      throw error;
    }
  }

  const json = employee.toJSON();
  json.department = presentDepartment(department);
  json.currentAssignments = currentAssignments;
  return json;
}

async function list(query) {
  const filter = { ...archivedFilter(query) };
  if (query.departmentId) filter.department = query.departmentId;
  if (query.status) filter.status = query.status;
  if (query.employmentType) filter.employmentType = query.employmentType;
  if (query.siteId) {
    const ids = await Assignment.find({ site: query.siteId, isCurrent: true }).distinct('employee');
    filter._id = { $in: ids };
  }
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [
      { fullName: pattern },
      { code: pattern },
      { phone: pattern },
      { designation: pattern },
      { idNumber: pattern },
    ];
  }

  return repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS),
    populate: POPULATE,
  });
}

async function currentAssignments(employeeId) {
  return Assignment.find({ employee: employeeId, isCurrent: true })
    .populate('site', 'name code status project')
    .sort({ startDate: -1 });
}

async function getById(id) {
  const doc = await getActive(id);
  const json = doc.toJSON();
  json.currentAssignments = await currentAssignments(doc._id);
  return json;
}

async function update(id, body) {
  const doc = await Employee.findById(id);
  if (!doc || doc.isDeleted) throw new AppError('Employee not found', 404, 'NOT_FOUND');

  if (body.departmentId) {
    await assertDepartment(body.departmentId);
    doc.department = body.departmentId;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    doc.email = body.email ? body.email.toLowerCase() : undefined;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
    doc.phone = body.phone || undefined;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'relievingDate')) {
    doc.relievingDate = body.relievingDate || undefined;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'siteId')) {
    if (body.siteId) await requireDoc(Site, body.siteId, 'Site', { isDeleted: false });
    doc.site = body.siteId || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'idNumber')) {
    doc.idNumber = body.idNumber || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'accountNumber')) {
    doc.accountNumber = body.accountNumber || '';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'ifscCode')) {
    doc.ifscCode = body.ifscCode || '';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'profilePhoto')) {
    doc.profilePhoto = body.profilePhoto || null;
  }

  assignDefined(doc, body, [
    'fullName',
    'address',
    'designation',
    'idType',
    'idPhotos',
    'bankName',
    'employmentType',
    'status',
    'joiningDate',
    'notes',
  ]);

  if (body.salary) {
    if (body.salary.payBasis) doc.salary.payBasis = body.salary.payBasis;
    if (body.salary.baseAmount !== undefined) doc.salary.baseAmount = body.salary.baseAmount;
    if (body.salary.allowances) doc.salary.allowances = body.salary.allowances;
    doc.markModified('salary');
  }

  assertEmploymentDates(doc);

  if (doc.status === 'resigned') {
    await closeCurrentAssignments(doc._id, doc.relievingDate);
  }

  await doc.save();
  return getById(doc.id);
}

async function remove(id) {
  const doc = await Employee.findById(id);
  if (!doc || doc.isDeleted) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  await closeCurrentAssignments(doc._id, new Date());
  doc.isDeleted = true;
  if (doc.status === 'active') doc.status = 'inactive';
  await doc.save();
}

async function restore(id) {
  const doc = await Employee.findById(id);
  if (!doc) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  if (!doc.isDeleted) throw new AppError('Employee is already active', 400, 'BAD_REQUEST');
  await assertDepartment(doc.department);
  doc.isDeleted = false;
  if (doc.status !== 'resigned') doc.status = 'active';
  await doc.save();
  return getById(doc.id);
}

async function assign(employeeId, body) {
  const employee = await Employee.findById(employeeId);
  if (!employee || employee.isDeleted) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  const assigned = await assignToSite(employee, body.siteId, body.startDate, body.remarks);
  return presentAssignment(assigned.assignment, assigned.site);
}

async function release(employeeId, assignmentId, body) {
  const assignment = await Assignment.findOne({ _id: assignmentId, employee: employeeId });
  if (!assignment) throw new AppError('Assignment not found', 404, 'NOT_FOUND');
  if (!assignment.isCurrent) throw new AppError('Assignment is already closed', 400, 'BAD_REQUEST');

  const endDate = body.endDate || new Date();
  if (endDate < assignment.startDate) {
    throw new AppError('End date must be on or after the assignment start date', 400, 'BAD_REQUEST');
  }

  assignment.isCurrent = false;
  assignment.endDate = endDate;
  await assignment.save();
  return assignment.populate('site', 'name code status project');
}

async function listAssignments(employeeId, query) {
  await getActive(employeeId);
  const filter = { employee: employeeId };
  if (query.current !== undefined) filter.isCurrent = query.current;
  return Assignment.find(filter)
    .populate('site', 'name code status project')
    .sort({ startDate: -1 });
}

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
  restore,
  assign,
  release,
  listAssignments,
};
