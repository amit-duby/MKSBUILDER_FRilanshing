const mongoose = require('mongoose');
const { COLLECTIONS, ASSIGNMENT_STATUS } = require('../../config/constants');
const [ASSIGNMENT_ASSIGNED, ASSIGNMENT_NOT_ASSIGNED] = ASSIGNMENT_STATUS;
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const { removeStoredImage } = require('../../common/utils/compressImage');
const {
  assignDefined,
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
];

async function getActive(id) {
  const doc = await Employee.findById(id).populate(POPULATE);
  if (!doc) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  return doc;
}

async function assertDepartment(departmentId) {
  const department = await requireDoc(Department, departmentId, 'Department');
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

function assignmentStatusOf(assignments) {
  return Array.isArray(assignments) && assignments.length
    ? ASSIGNMENT_ASSIGNED
    : ASSIGNMENT_NOT_ASSIGNED;
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

  const site = await requireDoc(Site, siteId, 'Site');
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
  json.assignmentStatus = assignmentStatusOf(currentAssignments);
  return json;
}

async function list(query) {
  const filter = {};
  if (query.departmentId) filter.department = new mongoose.Types.ObjectId(query.departmentId);
  if (query.status) filter.status = query.status;
  if (query.employmentType) filter.employmentType = query.employmentType;
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

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const skip = (page - 1) * limit;
  const sort = parseSort(query.sort, SORT_FIELDS);
  const pipeline = [{ $match: filter }];
  const siteId = query.siteId ? new mongoose.Types.ObjectId(query.siteId) : null;

  if (siteId && query.assignmentStatus === ASSIGNMENT_NOT_ASSIGNED) {
    pipeline.push({ $match: { _id: { $exists: false } } });
  } else if (siteId || query.assignmentStatus) {
    const assignmentMatch = [
      { $eq: ['$employee', '$$employeeId'] },
      { $eq: ['$isCurrent', true] },
    ];
    if (siteId) assignmentMatch.push({ $eq: ['$site', siteId] });

    pipeline.push(
      {
        $lookup: {
          from: COLLECTIONS.employeeAssignments,
          let: { employeeId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: assignmentMatch } } },
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: '_assigned',
        },
      },
      {
        $match: query.assignmentStatus === ASSIGNMENT_NOT_ASSIGNED
          ? { '_assigned.0': { $exists: false } }
          : { '_assigned.0': { $exists: true } },
      }
    );
  }

  pipeline.push(
    { $sort: sort },
    {
      $facet: {
        items: [
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
              let: { employeeId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$employee', '$$employeeId'] },
                        { $eq: ['$isCurrent', true] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
                { $project: { _id: 1 } },
              ],
              as: '_assigned',
            },
          },
          {
            $addFields: {
              assignmentStatus: {
                $cond: [
                  { $gt: [{ $size: '$_assigned' }, 0] },
                  ASSIGNMENT_ASSIGNED,
                  ASSIGNMENT_NOT_ASSIGNED,
                ],
              },
            },
          },
          { $project: { _assigned: 0 } },
        ],
        total: [{ $count: 'count' }],
      },
    }
  );

  const [result] = await Employee.aggregate(pipeline).option({ maxTimeMS: 4000 });
  const items = result && result.items ? result.items : [];
  const total = result && result.total && result.total[0] ? result.total[0].count : 0;

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 1 : Math.ceil(total / limit),
    },
  };
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
  json.assignmentStatus = assignmentStatusOf(json.currentAssignments);
  return json;
}

const MAX_ID_PHOTOS = 2;

function capIdPhotos(photos) {
  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  if (list.length <= MAX_ID_PHOTOS) return list;
  list.slice(MAX_ID_PHOTOS).forEach((photo) => removeStoredImage(photo, 'employees'));
  return list.slice(0, MAX_ID_PHOTOS);
}

function replaceIdPhotos(existing, incoming) {
  const current = capIdPhotos(existing);
  const nextPhotos = incoming.filter(Boolean).slice(0, MAX_ID_PHOTOS);
  if (!nextPhotos.length) return current;

  const next = [...current];
  for (let index = 0; index < nextPhotos.length; index += 1) {
    const photo = nextPhotos[index];
    if (index < next.length) {
      if (next[index] !== photo) removeStoredImage(next[index], 'employees');
      next[index] = photo;
      continue;
    }
    next.push(photo);
  }
  return capIdPhotos(next);
}

async function update(id, body) {
  const doc = await Employee.findById(id);
  if (!doc) throw new AppError('Employee not found', 404, 'NOT_FOUND');

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
    if (body.profilePhoto && doc.profilePhoto && body.profilePhoto !== doc.profilePhoto) {
      removeStoredImage(doc.profilePhoto, 'employees');
    }
    doc.profilePhoto = body.profilePhoto || null;
  }
  if (Array.isArray(body.idPhotos)) {
    doc.idPhotos = replaceIdPhotos(doc.idPhotos, body.idPhotos);
  } else {
    doc.idPhotos = capIdPhotos(doc.idPhotos);
  }

  assignDefined(doc, body, [
    'fullName',
    'address',
    'designation',
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
  return getById(doc.id);
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
  const assigned = await assignToSite(
    employee,
    body.siteId,
    body.startDate,
    body.remarks
  );
  return presentAssignment(assigned.assignment, assigned.site);
}

async function findEmployeeAssignment(employeeId, assignmentOrSiteId) {
  const assignment = await Assignment.findOne({
    _id: assignmentOrSiteId,
    employee: employeeId,
  });
  if (assignment) return assignment;

  return Assignment.findOne({
    employee: employeeId,
    site: assignmentOrSiteId,
    isCurrent: true,
  });
}

async function release(employeeId, assignmentId, body = {}) {
  const assignment = await findEmployeeAssignment(employeeId, assignmentId);
  if (!assignment) {
    throw new AppError(
      'Assignment not found for this employee. Use the assignment id from GET /employees/:id/assignments (data[].id) or the current site id',
      404,
      'NOT_FOUND'
    );
  }
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
  assign,
  release,
  listAssignments,
};
