const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  containsRegex,
  parseSort,
} = require('../../common/utils/helpers');
const { COLLECTIONS } = require('../../config/constants');
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

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.isValidObjectId(value)) return new mongoose.Types.ObjectId(String(value));
  return null;
}

function presentListItem(doc) {
  if (doc._id && doc.id == null) doc.id = String(doc._id);
  delete doc.__v;
  if (doc.department) {
    if (doc.department._id && doc.department.id == null) {
      doc.department.id = String(doc.department._id);
    }
  }
  if (Array.isArray(doc.currentAssignments)) {
    for (const assignment of doc.currentAssignments) {
      if (assignment._id && assignment.id == null) assignment.id = String(assignment._id);
      if (assignment.site && assignment.site._id && assignment.site.id == null) {
        assignment.site.id = String(assignment.site._id);
      }
    }
  } else {
    doc.currentAssignments = [];
  }
  return doc;
}

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
    .select('employee site startDate endDate isCurrent remarks')
    .populate('site', 'name code status project')
    .sort({ startDate: -1 })
    .lean({ virtuals: true });

  const byEmployee = new Map();
  for (const assignment of assignments) {
    if (assignment._id && assignment.id == null) assignment.id = String(assignment._id);
    if (assignment.site && assignment.site._id && assignment.site.id == null) {
      assignment.site.id = String(assignment.site._id);
    }
    const key = String(assignment.employee);
    const list = byEmployee.get(key) || [];
    list.push(assignment);
    byEmployee.set(key, list);
  }
  return byEmployee;
}

async function list(query) {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;
  const sort = parseSort(query.sort, SORT_FIELDS);

  const match = {};
  if (query.departmentId) {
    const departmentId = toObjectId(query.departmentId);
    if (departmentId) match.department = departmentId;
  }
  if (query.status) match.status = query.status;
  if (query.employmentType) match.employmentType = query.employmentType;
  if (query.category) match.category = query.category;
  if (query.search) {
    const pattern = containsRegex(query.search);
    match.$or = [
      { fullName: pattern },
      { code: pattern },
      { phone: pattern },
      { designation: pattern },
      { category: pattern },
      { idNumber: pattern },
    ];
  }

  const siteId = query.siteId ? toObjectId(query.siteId) : null;
  const pipeline = [];

  if (Object.keys(match).length) pipeline.push({ $match: match });

  // Optional site filter without a separate distinct() round-trip.
  if (siteId) {
    pipeline.push(
      {
        $lookup: {
          from: COLLECTIONS.employeeAssignments,
          let: { empId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$employee', '$$empId'] },
                    { $eq: ['$isCurrent', true] },
                    { $eq: ['$site', siteId] },
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: '_siteMatch',
        },
      },
      { $match: { '_siteMatch.0': { $exists: true } } },
      { $project: { _siteMatch: 0 } }
    );
  }

  // Single Atlas round-trip for page items + total + department + assignments.
  pipeline.push({
    $facet: {
      items: [
        { $sort: sort },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: COLLECTIONS.departments,
            localField: 'department',
            foreignField: '_id',
            pipeline: [{ $project: { name: 1, code: 1, isActive: 1 } }],
            as: 'department',
          },
        },
        { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: COLLECTIONS.employeeAssignments,
            let: { empId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$employee', '$$empId'] },
                      { $eq: ['$isCurrent', true] },
                    ],
                  },
                },
              },
              { $sort: { startDate: -1 } },
              {
                $lookup: {
                  from: COLLECTIONS.sites,
                  localField: 'site',
                  foreignField: '_id',
                  pipeline: [{ $project: { name: 1, code: 1, status: 1, project: 1 } }],
                  as: 'site',
                },
              },
              { $unwind: { path: '$site', preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  employee: 1,
                  site: 1,
                  startDate: 1,
                  endDate: 1,
                  isCurrent: 1,
                  remarks: 1,
                },
              },
            ],
            as: 'currentAssignments',
          },
        },
      ],
      meta: [{ $count: 'total' }],
    },
  });

  const [facet] = await Employee.aggregate(pipeline);
  const items = (facet?.items || []).map(presentListItem);
  const total = facet?.meta?.[0]?.total || 0;

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / limit),
    },
  };
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
