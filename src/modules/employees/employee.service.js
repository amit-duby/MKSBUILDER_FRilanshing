const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  containsRegex,
  parseSort,
} = require('../../common/utils/helpers');
const Employee = require('./employee.model');
const Assignment = require('./assignment.model');
const Department = require('../departments/department.model');
const Site = require('../sites/site.model');
const { removeStoredEmployeePhoto } = require('../../common/middleware/employeeUpload');

const repo = new BaseRepository(Employee);
const SORT_FIELDS = ['fullName', 'code', 'joiningDate', 'createdAt', 'designation'];
const POPULATE = [
  { path: 'department', select: 'name code isActive' },
];

async function getActive(id) {
  const doc = await Employee.findById(id).populate(POPULATE).lean({ virtuals: true });
  if (!doc) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  if (doc._id && doc.id == null) doc.id = String(doc._id);
  if (doc.department && doc.department._id && doc.department.id == null) {
    doc.department.id = String(doc.department._id);
  }
  return doc;
}

async function assertDepartment(departmentId) {
  const department = await Department.findById(departmentId).select('name code isActive').lean();
  if (!department) throw new AppError('Department not found', 404, 'NOT_FOUND');
  if (!department.isActive) {
    throw new AppError('Department is inactive', 400, 'BAD_REQUEST');
  }
  return {
    _id: department._id,
    id: String(department._id),
    name: department.name,
    code: department.code,
    isActive: department.isActive,
  };
}

async function assertActiveSite(siteId) {
  const site = await Site.findById(siteId).select('name code status project').lean();
  if (!site) throw new AppError('Site not found', 404, 'NOT_FOUND');
  if (site.status !== 'active') {
    throw new AppError('Employees can only be assigned to an active site', 400, 'BAD_REQUEST');
  }
  return {
    _id: site._id,
    id: String(site._id),
    name: site.name,
    code: site.code,
    status: site.status,
    project: site.project,
  };
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
  const json = typeof assignment.toJSON === 'function' ? assignment.toJSON() : assignment;
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

async function assignToSite(employee, siteId, startDate, remarks, preloadedSite = null) {
  if (employee.status !== 'active') {
    throw new AppError('Only active employees can be assigned to a site', 400, 'BAD_REQUEST');
  }

  const site = preloadedSite || await assertActiveSite(siteId);

  const assignmentStart = startDate || new Date();
  if (assignmentStart < employee.joiningDate) {
    throw new AppError('Assignment cannot start before the joining date', 400, 'BAD_REQUEST');
  }

  if (!preloadedSite) {
    const existing = await Assignment.findOne({
      employee: employee._id,
      site: site._id,
      isCurrent: true,
    }).select('_id').lean();
    if (existing) {
      throw new AppError('This employee is already assigned to the site', 409, 'CONFLICT');
    }
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

  // One parallel DB round: department + code (+ site when assigning on create)
  const [department, code, site] = await Promise.all([
    assertDepartment(body.departmentId),
    nextCode('employee', 'EMP'),
    body.siteId ? assertActiveSite(body.siteId) : null,
  ]);

  const employee = await Employee.create({
    code,
    fullName: body.fullName,
    phone: body.phone,
    email: body.email ? body.email.toLowerCase() : undefined,
    address: body.address || '',
    department: body.departmentId,
    designation: body.designation || '',
    category: body.category || '',
    idType: body.idType || '',
    idNumber: body.idNumber || null,
    profilePhoto: body.profilePhoto || null,
    idPhotos: body.idPhotos || [],
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
  if (site) {
    try {
      const assigned = await assignToSite(employee, body.siteId, body.joiningDate, '', site);
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

async function loadCurrentAssignments(employeeIds) {
  if (!employeeIds.length) return new Map();

  const assignments = await Assignment.find({
    employee: { $in: employeeIds },
    isCurrent: true,
  })
    .populate('site', 'name code status project')
    .sort({ startDate: -1 });

  const byEmployee = new Map();
  for (const assignment of assignments) {
    const key = String(assignment.employee);
    const list = byEmployee.get(key) || [];
    list.push(typeof assignment.toJSON === 'function' ? assignment.toJSON() : assignment);
    byEmployee.set(key, list);
  }
  return byEmployee;
}

async function list(query) {
  const filter = {};
  if (query.departmentId) filter.department = query.departmentId;
  if (query.status) filter.status = query.status;
  if (query.employmentType) filter.employmentType = query.employmentType;
  if (query.category) filter.category = query.category;
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
      { category: pattern },
      { idNumber: pattern },
    ];
  }

  const result = await repo.paginate({
    filter,
    page: query.page,
    limit: query.limit,
    sort: parseSort(query.sort, SORT_FIELDS),
    populate: POPULATE,
  });

  const byEmployee = await loadCurrentAssignments(result.items.map((item) => item._id || item.id));
  result.items = result.items.map((item) => {
    const json = typeof item.toJSON === 'function' ? item.toJSON() : item;
    json.currentAssignments = byEmployee.get(String(item.id || item._id)) || [];
    return json;
  });
  return result;
}

async function currentAssignments(employeeId) {
  const byEmployee = await loadCurrentAssignments([employeeId]);
  return byEmployee.get(String(employeeId)) || [];
}

async function getById(id) {
  const [doc, assignments] = await Promise.all([
    Employee.findById(id).populate(POPULATE).lean({ virtuals: true }),
    loadCurrentAssignments([id]),
  ]);
  if (!doc) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  if (doc._id && doc.id == null) doc.id = String(doc._id);
  if (doc.department && doc.department._id && doc.department.id == null) {
    doc.department.id = String(doc.department._id);
  }
  doc.currentAssignments = assignments.get(String(id)) || [];
  return doc;
}

async function update(id, body) {
  const doc = await Employee.findById(id);
  if (!doc) throw new AppError('Employee not found', 404, 'NOT_FOUND');

  let department;
  if (body.departmentId) {
    department = await assertDepartment(body.departmentId);
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
    if (body.profilePhoto && body.profilePhoto !== doc.profilePhoto) {
      removeStoredEmployeePhoto(doc.profilePhoto);
    }
    doc.profilePhoto = body.profilePhoto || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'idPhotos')) {
    const nextPhotos = Array.isArray(body.idPhotos) ? body.idPhotos : [];
    const previous = Array.isArray(doc.idPhotos) ? doc.idPhotos : [];
    for (const oldPath of previous) {
      if (!nextPhotos.includes(oldPath)) removeStoredEmployeePhoto(oldPath);
    }
    doc.idPhotos = nextPhotos;
  }

  assignDefined(doc, body, [
    'fullName',
    'address',
    'designation',
    'category',
    'idType',
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
  const [, assignmentMap] = await Promise.all([
    department ? Promise.resolve(null) : doc.populate(POPULATE),
    loadCurrentAssignments([doc._id]),
  ]);
  const json = doc.toJSON();
  if (department) json.department = presentDepartment(department);
  json.currentAssignments = assignmentMap.get(String(doc.id)) || [];
  return json;
}

async function remove(id) {
  const doc = await Employee.findById(id);
  if (!doc) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  await Assignment.deleteMany({ employee: doc._id });
  await doc.deleteOne();
}

async function assign(employeeId, body) {
  const employee = await Employee.findById(employeeId);
  if (!employee) throw new AppError('Employee not found', 404, 'NOT_FOUND');
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
  const exists = await Employee.exists({ _id: employeeId });
  if (!exists) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  const filter = { employee: employeeId };
  if (query.current !== undefined) filter.isCurrent = query.current;
  return Assignment.find(filter)
    .populate('site', 'name code status project')
    .sort({ startDate: -1 })
    .lean({ virtuals: true });
}

module.exports = {
  create,
  list,
  getById,
  update,
  remove,
  assign,
  release,
  listAssignments,
};
