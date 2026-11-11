const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  containsRegex,
  parseSort,
  addDays,
  startOfUtcDay,
  endOfUtcDay,
} = require('../../common/utils/helpers');
const { COLLECTIONS, DOCUMENT_EXPIRY_FIELDS } = require('../../config/constants');
const Vehicle = require('./vehicle.model');
const VehicleType = require('./vehicleType.model');
const Assignment = require('./assignment.model');
const Maintenance = require('./maintenance.model');
const MaintenanceCategory = require('./maintenanceCategory.model');
const { removeStoredReceipt } = require('../../common/middleware/maintenanceUpload');
const { removeStoredVehiclePhoto } = require('../../common/middleware/vehicleUpload');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');
const Expense = require('../accounts/expense.model');

const repo = new BaseRepository(Vehicle);
const SORT_FIELDS = ['registrationNumber', 'code', 'status', 'createdAt'];
const VEHICLE_TYPE_POPULATE = { path: 'vehicleType', select: 'name description status' };
const ASSIGNMENT_POPULATE = [
  { path: 'site', select: 'name code status' },
  { path: 'driver', select: 'fullName code designation profilePhoto' },
];
const MAINTENANCE_POPULATE = [
  {
    path: 'vehicle',
    select: 'code registrationNumber vehicleType status make modelName vehiclePhoto',
    populate: VEHICLE_TYPE_POPULATE,
  },
  { path: 'maintenanceCategory', select: 'name description status' },
];
const MAINTENANCE_SORT = ['date', 'amount', 'createdAt'];

function publicRef(doc) {
  if (!doc) return null;
  doc.id = doc._id.toString();
  delete doc._id;
  return doc;
}

function asId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (value._id && value._id !== value) return asId(value._id);
    if (typeof value.toString === 'function') {
      const text = value.toString();
      if (text && text !== '[object Object]') return text;
    }
    return null;
  }
  return String(value);
}

function asObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return new mongoose.Types.ObjectId(String(value));
}

function presentVehicleType(doc) {
  if (!doc) return null;
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const id = asId(json);
  if (!json.name) return id ? { id } : null;
  return {
    id,
    name: json.name,
    description: json.description || '',
    status: json.status,
  };
}

function presentVehicleBrief(doc) {
  if (!doc) return null;
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const id = asId(json);
  if (!json.registrationNumber && !json.code) return id ? { id } : null;
  return {
    id,
    code: json.code,
    registrationNumber: json.registrationNumber,
    vehicleType: presentVehicleType(json.vehicleType),
    make: json.make || '',
    modelName: json.modelName || '',
    status: json.status,
  };
}

async function assertVehicleType(vehicleTypeId) {
  const vehicleType = await VehicleType.findById(vehicleTypeId)
    .select('name description status')
    .lean();
  if (!vehicleType) throw new AppError('Vehicle type not found', 404, 'NOT_FOUND');
  if (vehicleType.status !== 'active') {
    throw new AppError('Choose an active vehicle type', 400, 'BAD_REQUEST');
  }
  return vehicleType;
}

function hasLegacyTypeField(doc) {
  if (!doc) return false;
  if (typeof doc.get === 'function' && doc.get('type', undefined, { getters: false }) !== undefined) {
    return true;
  }
  const raw = typeof doc.toObject === 'function'
    ? doc.toObject({ depopulate: true, versionKey: false, virtuals: false })
    : doc;
  return Object.prototype.hasOwnProperty.call(raw || {}, 'type');
}

async function unsetLegacyType(id) {
  await Vehicle.updateOne({ _id: id }, { $unset: { type: 1 } });
}

async function loadCurrentAssignmentLean(vehicle) {
  const assignmentId = vehicle.currentAssignment && (vehicle.currentAssignment._id || vehicle.currentAssignment);
  if (assignmentId) {
    const assignment = await Assignment.findById(assignmentId)
      .select('site driver assignedAt releasedAt remarks createdAt updatedAt')
      .populate(ASSIGNMENT_POPULATE)
      .lean({ virtuals: true });
    if (assignment) return assignment;
  }

  return Assignment.findOne({ vehicle: vehicle._id, releasedAt: null })
    .select('site driver assignedAt releasedAt remarks createdAt updatedAt')
    .sort({ assignedAt: -1 })
    .populate(ASSIGNMENT_POPULATE)
    .lean({ virtuals: true });
}

function presentCategoryBrief(doc) {
  if (!doc) return null;
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
  const id = asId(json);
  if (!json.name) return id ? { id } : null;
  return {
    id,
    name: json.name,
    description: json.description || '',
    status: json.status,
  };
}

function presentMaintenance(doc) {
  const json = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  const raw = doc._doc || json;
  const category = json.maintenanceCategory && json.maintenanceCategory.name
    ? json.maintenanceCategory
    : json.category || raw.category;

  return {
    id: json.id,
    vehicle: presentVehicleBrief(json.vehicle),
    maintenanceCategory: presentCategoryBrief(category),
    paidTo: json.paidTo || '',
    date: json.date,
    amount: json.amount,
    modeOfPayment: json.modeOfPayment || raw.amountType || null,
    reference: json.reference || raw.referenceNo || '',
    uploadReceipt: json.uploadReceipt || raw.singleImage || null,
    description: json.description || '',
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

function presentMaintenanceList(items) {
  return items.map((doc) => {
    if (doc && doc._id && doc.id == null) doc.id = String(doc._id);
    return presentMaintenance(doc);
  });
}

function buildMaintenanceListFilter(query) {
  const filter = {};
  if (query.vehicleId) filter.vehicle = asObjectId(query.vehicleId);
  if (query.maintenanceCategoryId) {
    filter.maintenanceCategory = asObjectId(query.maintenanceCategoryId);
  }
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = startOfUtcDay(query.from);
    if (query.to) filter.date.$lte = endOfUtcDay(query.to);
  }
  if (query.search) {
    const pattern = containsRegex(query.search);
    filter.$or = [{ paidTo: pattern }, { reference: pattern }, { description: pattern }];
  }
  return filter;
}

async function getMutable(id) {
  const doc = await Vehicle.findById(id);
  if (!doc) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
  // Legacy rows used status "maintenance"; that must never block assignment.
  if (doc.status === 'maintenance') {
    doc.status = doc.currentAssignment ? 'assigned' : 'available';
    await Vehicle.updateOne({ _id: doc._id }, { $set: { status: doc.status } });
  }
  return doc;
}

function presentAssignmentDetail(assignment) {
  if (!assignment) return null;
  const json = typeof assignment.toJSON === 'function' ? assignment.toJSON() : assignment;
  return {
    id: asId(json),
    site: json.site
      ? {
          id: asId(json.site),
          name: json.site.name,
          code: json.site.code,
          status: json.site.status,
        }
      : null,
    driver: json.driver
      ? {
          id: asId(json.driver),
          fullName: json.driver.fullName,
          code: json.driver.code,
          designation: json.driver.designation,
        }
      : null,
    assignedAt: json.assignedAt,
    releasedAt: json.releasedAt || null,
    remarks: json.remarks || '',
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

async function loadCurrentAssignment(vehicle) {
  let assignment = vehicle.currentAssignment;
  if (assignment && assignment.site) return assignment;

  if (vehicle.currentAssignment) {
    assignment = await Assignment.findById(vehicle.currentAssignment).populate(ASSIGNMENT_POPULATE);
    if (assignment) return assignment;
  }

  return Assignment.findOne({ vehicle: vehicle._id, releasedAt: null })
    .sort({ assignedAt: -1 })
    .populate(ASSIGNMENT_POPULATE);
}

function presentStatus(status, hasAssignment) {
  if (status === 'maintenance') return hasAssignment ? 'assigned' : 'available';
  return status;
}

async function present(id) {
  const doc = await getMutable(id);
  await Promise.all([
    doc.populate(VEHICLE_TYPE_POPULATE),
    doc.populate({
      path: 'currentAssignment',
      populate: ASSIGNMENT_POPULATE,
    }),
  ]);

  const assignment = await loadCurrentAssignment(doc);
  const json = doc.toJSON();
  json.status = presentStatus(json.status, Boolean(assignment));
  json.currentAssignment = presentAssignmentDetail(assignment);
  return json;
}

function assertOdometer(vehicle, reading) {
  if (reading === undefined || reading === null) return;
  if (vehicle.odometer != null && reading < vehicle.odometer) {
    throw new AppError('Odometer cannot be lower than the last reading', 400, 'BAD_REQUEST');
  }
  vehicle.odometer = reading;
}

function applyDocuments(vehicle, documents) {
  if (!documents) return;
  vehicle.documents = vehicle.documents || {};
  for (const field of DOCUMENT_EXPIRY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(documents, field)) {
      vehicle.documents[field] = documents[field] || undefined;
    }
  }
  vehicle.markModified('documents');
}

async function recordExpense(payload, user) {
  const expenseService = require('../accounts/expense.service');
  return expenseService.create(payload, user, { present: false, trustRefs: true });
}

function presentMaintenanceFromParts(log, vehicle, category) {
  const raw = typeof log.toObject === 'function' ? log.toObject() : { ...log };
  if (raw._id && raw.id == null) raw.id = String(raw._id);
  raw.vehicle = vehicle || raw.vehicle;
  raw.maintenanceCategory = category || raw.maintenanceCategory;
  return presentMaintenance(raw);
}

async function voidExpense(expense, reason = 'Linked vehicle log could not be saved') {
  if (!expense) return;
  const doc = typeof expense.isVoid === 'boolean'
    ? expense
    : await Expense.findById(expense);
  if (!doc || doc.isVoid) return;
  doc.isVoid = true;
  doc.voidedAt = new Date();
  doc.voidReason = reason;
  await doc.save();
}


function isDriverDepartment(department) {
  if (!department) return false;
  const name = String(department.name || '').trim().toLowerCase();
  const code = String(department.code || '').trim().toLowerCase();
  return name === 'driver' || code === 'driver';
}

async function loadAssignmentTargets(body) {
  const [site, driver] = await Promise.all([
    requireDoc(Site, body.siteId, 'Site'),
    body.driverId
      ? Employee.findById(body.driverId).populate('department', 'name code isActive')
      : null,
  ]);
  if (site.status !== 'active') {
    throw new AppError('Vehicles can only be assigned to an active site', 400, 'BAD_REQUEST');
  }
  if (body.driverId && !driver) {
    throw new AppError('Employee not found', 404, 'NOT_FOUND');
  }
  if (driver && driver.status !== 'active') {
    throw new AppError('Driver must be an active employee', 400, 'BAD_REQUEST');
  }
  if (driver && !isDriverDepartment(driver.department)) {
    throw new AppError(
      'Only employees from the Driver department can be assigned to a vehicle',
      400,
      'BAD_REQUEST'
    );
  }
  return { site, driver };
}

async function assertDriverSiteAvailable(siteId, driverId, excludeVehicleId) {
  if (!driverId) return;

  const active = await Assignment.findOne({
    site: siteId,
    driver: driverId,
    releasedAt: null,
    vehicle: { $ne: excludeVehicleId },
  }).select('_id vehicle');

  if (active) {
    throw new AppError(
      'This driver and site are already assigned to another vehicle. Release that assignment first',
      409,
      'CONFLICT'
    );
  }
}

function presentCreatedAssignment(assignment, site, driver) {
  return {
    id: assignment.id,
    vehicle: assignment.vehicle,
    site: {
      id: site.id,
      name: site.name,
      code: site.code,
      status: site.status,
    },
    driver: driver
      ? {
        id: driver.id,
        fullName: driver.fullName,
        code: driver.code,
        designation: driver.designation,
      }
      : null,
    assignedAt: assignment.assignedAt,
    releasedAt: assignment.releasedAt,
    remarks: assignment.remarks || '',
  };
}

const service = {
  async create(body) {
    const [code, vehicleType] = await Promise.all([
      nextCode('vehicle', 'VEH'),
      assertVehicleType(body.vehicleTypeId),
    ]);

    const vehicle = await repo.create({
      code,
      registrationNumber: body.registrationNumber,
      vehicleType: vehicleType._id,
      make: body.make || '',
      modelName: body.modelName || '',
      year: body.year,
      fuelType: body.fuelType || 'diesel',
      status: 'available',
      vehiclePhoto: body.vehiclePhoto || null,
      odometer: body.odometer,
      documents: body.documents || {},
      notes: body.notes || '',
    });
    const json = vehicle.toJSON();
    json.vehicleType = presentVehicleType(vehicleType);
    json.currentAssignment = null;
    return json;
  },

  async list(query) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const sort = parseSort(query.sort, SORT_FIELDS);

    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.vehicleTypeId) filter.vehicleType = asObjectId(query.vehicleTypeId);
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$or = [
        { registrationNumber: pattern },
        { code: pattern },
        { make: pattern },
        { modelName: pattern },
      ];
    }

    const siteId = query.siteId ? asObjectId(query.siteId) : null;
    const pipeline = [{ $match: filter }];

    if (siteId) {
      pipeline.push(
        {
          $lookup: {
            from: COLLECTIONS.vehicleAssignments,
            let: { vehicleId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$vehicle', '$$vehicleId'] },
                      { $eq: ['$releasedAt', null] },
                      { $eq: ['$site', siteId] },
                    ],
                  },
                },
              },
              { $limit: 1 },
              { $project: { _id: 1 } },
            ],
            as: 'siteAssignmentMatch',
          },
        },
        { $match: { 'siteAssignmentMatch.0': { $exists: true } } }
      );
    }

    pipeline.push({
      $facet: {
        items: [
          { $sort: sort },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: COLLECTIONS.vehicleTypes,
              localField: 'vehicleType',
              foreignField: '_id',
              pipeline: [{ $project: { name: 1, description: 1, status: 1 } }],
              as: 'vehicleTypeDocs',
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.vehicleAssignments,
              localField: 'currentAssignment',
              foreignField: '_id',
              pipeline: [
                { $project: { site: 1, driver: 1, assignedAt: 1, releasedAt: 1, remarks: 1, createdAt: 1, updatedAt: 1 } },
              ],
              as: 'assignmentByIdDocs',
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.vehicleAssignments,
              let: { vehicleId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$vehicle', '$$vehicleId'] },
                        { $eq: ['$releasedAt', null] },
                      ],
                    },
                  },
                },
                { $sort: { assignedAt: -1 } },
                { $limit: 1 },
                { $project: { site: 1, driver: 1, assignedAt: 1, releasedAt: 1, remarks: 1, createdAt: 1, updatedAt: 1 } },
              ],
              as: 'openAssignmentDocs',
            },
          },
          {
            $addFields: {
              vehicleType: { $arrayElemAt: ['$vehicleTypeDocs', 0] },
              currentAssignment: {
                $let: {
                  vars: {
                    byId: { $arrayElemAt: ['$assignmentByIdDocs', 0] },
                    open: { $arrayElemAt: ['$openAssignmentDocs', 0] },
                  },
                  in: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$$byId', null] },
                          { $ne: ['$$byId.site', null] },
                        ],
                      },
                      '$$byId',
                      '$$open',
                    ],
                  },
                },
              },
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.sites,
              localField: 'currentAssignment.site',
              foreignField: '_id',
              pipeline: [{ $project: { name: 1, code: 1, status: 1 } }],
              as: 'siteDocs',
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.employees,
              localField: 'currentAssignment.driver',
              foreignField: '_id',
              pipeline: [{ $project: { fullName: 1, code: 1, designation: 1, profilePhoto: 1 } }],
              as: 'driverDocs',
            },
          },
          {
            $addFields: {
              currentAssignment: {
                $cond: [
                  { $eq: [{ $type: '$currentAssignment' }, 'object'] },
                  {
                    $mergeObjects: [
                      '$currentAssignment',
                      {
                        site: { $arrayElemAt: ['$siteDocs', 0] },
                        driver: { $arrayElemAt: ['$driverDocs', 0] },
                      },
                    ],
                  },
                  null,
                ],
              },
            },
          },
          {
            $project: {
              vehicleTypeDocs: 0,
              assignmentByIdDocs: 0,
              openAssignmentDocs: 0,
              siteDocs: 0,
              driverDocs: 0,
              siteAssignmentMatch: 0,
              __v: 0,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    });

    const [facet = {}] = await Vehicle.aggregate(pipeline);
    const total = facet.total && facet.total[0] ? facet.total[0].count : 0;

    return {
      items: (facet.items || []).map((item) => {
        const id = String(item._id);
        const assignment = item.currentAssignment && item.currentAssignment.site
          ? item.currentAssignment
          : null;
        const row = {
          ...item,
          id,
          status: presentStatus(item.status, Boolean(assignment)),
          vehicleType: presentVehicleType(item.vehicleType),
          currentAssignment: presentAssignmentDetail(assignment),
        };
        delete row._id;
        return row;
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 1 : Math.ceil(total / limit),
      },
    };
  },

  getById(id) {
    return present(id);
  },

  async update(id, body) {
    const [doc, requestedType] = await Promise.all([
      Vehicle.findById(id),
      body.vehicleTypeId ? assertVehicleType(body.vehicleTypeId) : null,
    ]);
    if (!doc) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');

    let vehicleType = requestedType;
    if (doc.status === 'maintenance') {
      doc.status = doc.currentAssignment ? 'assigned' : 'available';
    }

    if (body.status && body.status !== doc.status) {
      if (doc.status === 'assigned' || doc.currentAssignment) {
        throw new AppError('Release the vehicle before changing status', 409, 'CONFLICT');
      }
      doc.status = body.status;
    }

    if (body.registrationNumber) doc.registrationNumber = body.registrationNumber;
    if (vehicleType) doc.vehicleType = vehicleType._id;
    assignDefined(doc, body, ['make', 'modelName', 'year', 'fuelType', 'notes']);
    if (Object.prototype.hasOwnProperty.call(body, 'vehiclePhoto')) {
      if (body.vehiclePhoto && body.vehiclePhoto !== doc.vehiclePhoto) {
        removeStoredVehiclePhoto(doc.vehiclePhoto);
      }
      if (body.vehiclePhoto === null && doc.vehiclePhoto) {
        removeStoredVehiclePhoto(doc.vehiclePhoto);
      }
      doc.vehiclePhoto = body.vehiclePhoto || null;
    }
    if (body.odometer !== undefined) assertOdometer(doc, body.odometer);
    applyDocuments(doc, body.documents);

    const shouldUnsetLegacyType = hasLegacyTypeField(doc);
    await doc.save();

    const [assignment, loadedType] = await Promise.all([
      loadCurrentAssignmentLean(doc),
      vehicleType
        ? Promise.resolve(vehicleType)
        : VehicleType.findById(doc.vehicleType).select('name description status').lean(),
      shouldUnsetLegacyType ? unsetLegacyType(doc._id) : Promise.resolve(null),
    ]);

    const json = doc.toJSON();
    json.status = presentStatus(json.status, Boolean(assignment));
    json.vehicleType = presentVehicleType(loadedType);
    json.currentAssignment = presentAssignmentDetail(assignment);
    return json;
  },

  async remove(id) {
    const doc = await getMutable(id);
    if (doc.status === 'assigned' || doc.currentAssignment) {
      throw new AppError('Release the vehicle before deleting it', 409, 'CONFLICT');
    }
    const photo = doc.vehiclePhoto;
    await Promise.all([
      Assignment.deleteMany({ vehicle: doc._id }),
      Maintenance.deleteMany({ vehicle: doc._id }),
    ]);
    await doc.deleteOne();
    removeStoredVehiclePhoto(photo);
  },

  async alerts(query) {
    const horizon = addDays(new Date(), query.withinDays);
    const vehicles = await Vehicle.find({
      $or: DOCUMENT_EXPIRY_FIELDS.map((field) => ({
        [`documents.${field}`]: { $ne: null, $lte: horizon },
      })),
    })
      .populate(VEHICLE_TYPE_POPULATE)
      .sort({ registrationNumber: 1 });

    return vehicles.map((vehicle) => {
      const json = vehicle.toJSON();
      json.dueDocuments = DOCUMENT_EXPIRY_FIELDS
        .filter((field) => vehicle.documents && vehicle.documents[field] && vehicle.documents[field] <= horizon)
        .map((field) => ({ type: field, expiresOn: vehicle.documents[field] }));
      return json;
    }).filter((vehicle) => vehicle.dueDocuments.length > 0);
  },

  async assign(id, body) {
    const vehicle = await getMutable(id);
    if (vehicle.status === 'inactive') {
      throw new AppError('Inactive vehicles cannot be assigned', 409, 'CONFLICT');
    }
    if (vehicle.currentAssignment || vehicle.status === 'assigned') {
      throw new AppError('Vehicle is already assigned', 409, 'CONFLICT');
    }

    const { site, driver } = await loadAssignmentTargets(body);
    await assertDriverSiteAvailable(site._id, driver && driver._id, vehicle._id);

    const assignment = await Assignment.create({
      vehicle: vehicle._id,
      site: site._id,
      driver: driver && driver._id,
      assignedAt: body.assignedAt || new Date(),
      releasedAt: null,
      remarks: body.remarks || '',
    });

    vehicle.status = 'assigned';
    vehicle.currentAssignment = assignment._id;
    await vehicle.save();
    return assignment.populate(ASSIGNMENT_POPULATE);
  },

  async release(id, body) {
    const vehicle = await getMutable(id);
    if (vehicle.status !== 'assigned' || !vehicle.currentAssignment) {
      throw new AppError('Vehicle is not assigned', 409, 'CONFLICT');
    }

    const assignment = await Assignment.findById(vehicle.currentAssignment);
    if (!assignment || assignment.releasedAt) {
      throw new AppError('Open assignment not found', 404, 'NOT_FOUND');
    }

    const releasedAt = body.releasedAt || new Date();
    if (releasedAt < assignment.assignedAt) {
      throw new AppError('Release time must be on or after the assignment time', 400, 'BAD_REQUEST');
    }

    assignment.releasedAt = releasedAt;
    if (body.remarks) assignment.remarks = body.remarks;
    await assignment.save();

    vehicle.status = 'available';
    vehicle.currentAssignment = undefined;
    await vehicle.save();
    return assignment.populate(ASSIGNMENT_POPULATE);
  },

  async listAllAssignments(query) {
    const filter = {};
    if (query.vehicleId) filter.vehicle = query.vehicleId;
    if (query.siteId) filter.site = query.siteId;
    if (query.driverId) filter.driver = query.driverId;
    if (query.current === true || query.current === undefined) {
      filter.releasedAt = null;
    } else if (query.current === false) {
      filter.releasedAt = { $ne: null };
    }
    if (query.from || query.to) {
      filter.assignedAt = {};
      if (query.from) filter.assignedAt.$gte = startOfUtcDay(query.from);
      if (query.to) filter.assignedAt.$lte = endOfUtcDay(query.to);
    }

    const result = await new BaseRepository(Assignment).paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: { assignedAt: -1 },
      populate: [
        {
          path: 'vehicle',
          select: 'code registrationNumber vehicleType status make modelName',
          populate: VEHICLE_TYPE_POPULATE,
        },
        ...ASSIGNMENT_POPULATE,
      ],
    });

    result.items = result.items.map((doc) => {
      const json = typeof doc.toJSON === 'function' ? doc.toJSON() : doc;
      return {
        id: json.id,
        vehicle: presentVehicleBrief(json.vehicle),
        site: json.site
          ? {
              id: asId(json.site),
              name: json.site.name,
              code: json.site.code,
              status: json.site.status,
            }
          : null,
        driver: json.driver
          ? {
              id: asId(json.driver),
              fullName: json.driver.fullName,
              code: json.driver.code,
              designation: json.driver.designation,
            }
          : null,
        assignedAt: json.assignedAt,
        releasedAt: json.releasedAt || null,
        remarks: json.remarks || '',
        createdAt: json.createdAt,
        updatedAt: json.updatedAt,
      };
    });

    return result;
  },

  async listAssignments(id, query) {
    await getMutable(id);
    return this.listAllAssignments({
      ...query,
      vehicleId: id,
      current: query.current === undefined ? null : query.current,
    });
  },

  async addMaintenance(id, body, user) {
    const [vehicle, category] = await Promise.all([
      Vehicle.findById(id)
        .select('status code registrationNumber vehicleType make modelName')
        .lean(),
      MaintenanceCategory.findById(body.maintenanceCategoryId)
        .select('name description status')
        .lean(),
    ]);

    if (!vehicle) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
    if (vehicle.status === 'inactive') {
      throw new AppError('Inactive vehicles cannot be sent for maintenance', 400, 'BAD_REQUEST');
    }
    if (!category) throw new AppError('Maintenance category not found', 404, 'NOT_FOUND');
    if (category.status !== 'active') {
      throw new AppError('Maintenance category is inactive', 400, 'BAD_REQUEST');
    }

    const amount = body.amount;
    if (body.recordExpense && !(amount > 0)) {
      throw new AppError('A recorded expense needs an amount greater than zero', 400, 'BAD_REQUEST');
    }

    const date = body.date || new Date();
    const description = body.description || `${category.name} — ${body.paidTo}`;
    const vehicleId = String(vehicle._id);

    let expense;
    if (body.recordExpense) {
      expense = await recordExpense({
        category: 'vehicle',
        amount,
        expenseDate: date,
        vehicleId,
        payeeName: body.payeeName || body.paidTo || 'Maintenance vendor',
        description,
        paymentModeNote: body.paymentModeNote || body.modeOfPayment,
      }, user);
    }

    try {
      const log = await Maintenance.create({
        vehicle: vehicle._id,
        maintenanceCategory: category._id,
        paidTo: body.paidTo,
        date,
        amount,
        modeOfPayment: body.modeOfPayment,
        reference: body.reference || '',
        uploadReceipt: body.uploadReceipt || null,
        description,
        expense: expense && expense._id,
      });
      return presentMaintenanceFromParts(log, vehicle, category);
    } catch (error) {
      await voidExpense(expense);
      throw error;
    }
  },

  async listAllMaintenance(query) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;
    const sort = parseSort(query.sort, MAINTENANCE_SORT, { date: -1 });
    const filter = buildMaintenanceListFilter(query);

    const [facet = {}] = await Maintenance.aggregate([
      { $match: filter },
      {
        $facet: {
          items: [
            { $sort: sort },
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: COLLECTIONS.vehicles,
                localField: 'vehicle',
                foreignField: '_id',
                pipeline: [
                  {
                    $project: {
                      code: 1,
                      registrationNumber: 1,
                      vehicleType: 1,
                      status: 1,
                      make: 1,
                      modelName: 1,
                    },
                  },
                ],
                as: 'vehicleDocs',
              },
            },
            {
              $lookup: {
                from: COLLECTIONS.vehicleMaintenanceCategories,
                localField: 'maintenanceCategory',
                foreignField: '_id',
                pipeline: [{ $project: { name: 1, description: 1, status: 1 } }],
                as: 'categoryDocs',
              },
            },
            {
              $addFields: {
                vehicle: { $arrayElemAt: ['$vehicleDocs', 0] },
                maintenanceCategory: { $arrayElemAt: ['$categoryDocs', 0] },
              },
            },
            {
              $lookup: {
                from: COLLECTIONS.vehicleTypes,
                localField: 'vehicle.vehicleType',
                foreignField: '_id',
                pipeline: [{ $project: { name: 1, description: 1, status: 1 } }],
                as: 'vehicleTypeDocs',
              },
            },
            {
              $addFields: {
                vehicle: {
                  $cond: [
                    { $eq: [{ $type: '$vehicle' }, 'object'] },
                    {
                      $mergeObjects: [
                        '$vehicle',
                        { vehicleType: { $arrayElemAt: ['$vehicleTypeDocs', 0] } },
                      ],
                    },
                    '$vehicle',
                  ],
                },
              },
            },
            {
              $project: {
                vehicleDocs: 0,
                categoryDocs: 0,
                vehicleTypeDocs: 0,
                __v: 0,
              },
            },
          ],
          total: [{ $count: 'count' }],
          categoryCounts: [
            { $group: { _id: '$maintenanceCategory', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            {
              $lookup: {
                from: COLLECTIONS.vehicleMaintenanceCategories,
                localField: '_id',
                foreignField: '_id',
                pipeline: [{ $project: { name: 1, description: 1, status: 1 } }],
                as: 'categoryDocs',
              },
            },
            {
              $project: {
                count: 1,
                maintenanceCategory: { $arrayElemAt: ['$categoryDocs', 0] },
              },
            },
          ],
        },
      },
    ]);

    const total = facet.total && facet.total[0] ? facet.total[0].count : 0;
    return {
      items: presentMaintenanceList(facet.items || []),
      categoryCounts: (facet.categoryCounts || []).map((row) => ({
        maintenanceCategory: presentCategoryBrief(row.maintenanceCategory)
          || (row._id ? { id: String(row._id) } : null),
        count: row.count,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 1 : Math.ceil(total / limit),
      },
    };
  },

  async listMaintenance(id, query) {
    const exists = await Vehicle.exists({ _id: id });
    if (!exists) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
    return this.listAllMaintenance({ ...query, vehicleId: id });
  },

  async updateMaintenance(id, body, user) {
    const log = await Maintenance.findById(id);
    if (!log) throw new AppError('Maintenance log not found', 404, 'NOT_FOUND');

    let category = null;
    if (body.maintenanceCategoryId) {
      category = await MaintenanceCategory.findById(body.maintenanceCategoryId)
        .select('name description status')
        .lean();
      if (!category) throw new AppError('Maintenance category not found', 404, 'NOT_FOUND');
      if (category.status !== 'active') {
        throw new AppError('Maintenance category is inactive', 400, 'BAD_REQUEST');
      }
      log.maintenanceCategory = category._id;
      if (!body.description && !log.description) {
        log.description = `${category.name} — ${body.paidTo || log.paidTo}`;
      }
    }

    assignDefined(log, body, ['paidTo', 'date', 'amount', 'modeOfPayment', 'reference', 'description']);

    if (body.uploadReceipt && body.uploadReceipt !== log.uploadReceipt) {
      removeStoredReceipt(log.uploadReceipt);
      log.uploadReceipt = body.uploadReceipt;
    }

    if (body.recordExpense && !log.expense) {
      const amount = log.amount;
      if (!(amount > 0)) {
        throw new AppError('A recorded expense needs an amount greater than zero', 400, 'BAD_REQUEST');
      }
      const expense = await recordExpense({
        category: 'vehicle',
        amount,
        expenseDate: log.date || new Date(),
        vehicleId: String(log.vehicle),
        payeeName: body.payeeName || log.paidTo || 'Maintenance vendor',
        description: log.description || 'Vehicle maintenance',
        paymentModeNote: body.paymentModeNote || log.modeOfPayment,
      }, user);
      log.expense = expense._id;
    }

    await log.save();

    const [vehicle, categoryDoc] = await Promise.all([
      Vehicle.findById(log.vehicle)
        .select('status code registrationNumber vehicleType make modelName')
        .lean(),
      category
        || MaintenanceCategory.findById(log.maintenanceCategory)
          .select('name description status')
          .lean(),
    ]);

    return presentMaintenanceFromParts(log, vehicle, categoryDoc);
  },

  async removeMaintenance(id) {
    const log = await Maintenance.findById(id);
    if (!log) throw new AppError('Maintenance log not found', 404, 'NOT_FOUND');

    removeStoredReceipt(log.uploadReceipt);
    await voidExpense(log.expense, 'Linked maintenance log was deleted');
    await log.deleteOne();
    return { id };
  },

};

module.exports = service;
