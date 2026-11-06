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
const Assignment = require('./assignment.model');
const Maintenance = require('./maintenance.model');
const MaintenanceCategory = require('./maintenanceCategory.model');
const FuelLog = require('./fuel.model');
const { removeStoredReceipt } = require('../../common/middleware/maintenanceUpload');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');

const repo = new BaseRepository(Vehicle);
const SORT_FIELDS = ['registrationNumber', 'code', 'type', 'status', 'createdAt'];
const ASSIGNMENT_POPULATE = [
  { path: 'site', select: 'name code status' },
  { path: 'driver', select: 'fullName code designation' },
];
const MAINTENANCE_POPULATE = [
  { path: 'vehicle', select: 'code registrationNumber type status make modelName' },
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
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value.id) return String(value.id);
  if (value._id) return String(value._id);
  return String(value);
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
    type: json.type,
    make: json.make || '',
    modelName: json.modelName || '',
    status: json.status,
  };
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
    nextDueDate: json.nextDueDate || null,
    completedAt: json.completedAt || null,
    completionNote: json.completionNote || '',
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

async function presentMaintenanceList(items) {
  const rows = items.map(presentMaintenance);
  const missing = [...new Set(
    rows
      .filter((row) => row.maintenanceCategory && row.maintenanceCategory.id && !row.maintenanceCategory.name)
      .map((row) => row.maintenanceCategory.id)
  )];
  if (!missing.length) return rows;

  const cats = await MaintenanceCategory.find({ _id: { $in: missing } }).select('name description status');
  const byId = new Map(cats.map((cat) => [cat.id, presentCategoryBrief(cat)]));
  for (const row of rows) {
    if (row.maintenanceCategory && !row.maintenanceCategory.name) {
      const filled = byId.get(row.maintenanceCategory.id);
      if (filled) row.maintenanceCategory = filled;
    }
  }
  return rows;
}

async function getMutable(id) {
  const doc = await Vehicle.findById(id);
  if (!doc) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
  return doc;
}

async function present(id) {
  const doc = await Vehicle.findById(id).populate({
    path: 'currentAssignment',
    populate: ASSIGNMENT_POPULATE,
  });
  if (!doc) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
  return doc;
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
  return expenseService.create(payload, user);
}

async function voidExpense(expense) {
  if (!expense || expense.isVoid) return;
  expense.isVoid = true;
  expense.voidedAt = new Date();
  expense.voidReason = 'Linked vehicle log could not be saved';
  await expense.save();
}

async function loadAssignmentTargets(body) {
  const [site, driver] = await Promise.all([
    requireDoc(Site, body.siteId, 'Site'),
    body.driverId
      ? requireDoc(Employee, body.driverId, 'Employee')
      : null,
  ]);
  if (site.status !== 'active') {
    throw new AppError('Vehicles can only be assigned to an active site', 400, 'BAD_REQUEST');
  }
  if (driver && driver.status !== 'active') {
    throw new AppError('Driver must be an active employee', 400, 'BAD_REQUEST');
  }
  return { site, driver };
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
    const assigning = Boolean(body.siteId);
    const [code, targets] = await Promise.all([
      nextCode('vehicle', 'VEH'),
      assigning ? loadAssignmentTargets(body) : null,
    ]);

    const vehicle = await repo.create({
      code,
      registrationNumber: body.registrationNumber,
      type: body.type,
      make: body.make || '',
      modelName: body.modelName || '',
      year: body.year,
      fuelType: body.fuelType || 'diesel',
      status: 'available',
      odometer: body.odometer,
      documents: body.documents || {},
      notes: body.notes || '',
    });

    if (!assigning) return vehicle;

    let assignment;
    try {
      assignment = await Assignment.create({
        vehicle: vehicle._id,
        site: targets.site._id,
        driver: targets.driver && targets.driver._id,
        assignedAt: body.assignedAt || new Date(),
        releasedAt: null,
        remarks: body.remarks || '',
      });
      vehicle.status = 'assigned';
      vehicle.currentAssignment = assignment._id;
      await vehicle.save();
    } catch (error) {
      await Promise.all([
        Vehicle.deleteOne({ _id: vehicle._id }),
        assignment ? Assignment.deleteOne({ _id: assignment._id }) : null,
      ]);
      throw error;
    }

    const json = vehicle.toJSON();
    json.currentAssignment = presentCreatedAssignment(assignment, targets.site, targets.driver);
    return json;
  },

  async list(query) {
    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.siteId) {
      const ids = await Assignment.find({ site: query.siteId, releasedAt: null }).distinct('vehicle');
      filter._id = { $in: ids };
    }
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$or = [
        { registrationNumber: pattern },
        { code: pattern },
        { make: pattern },
        { modelName: pattern },
      ];
    }

    return repo.paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, SORT_FIELDS),
      populate: [{ path: 'currentAssignment', populate: ASSIGNMENT_POPULATE }],
    });
  },

  getById(id) {
    return present(id);
  },

  async update(id, body) {
    const doc = await getMutable(id);
    if (body.status && body.status !== doc.status) {
      if (doc.status === 'assigned' || doc.status === 'maintenance') {
        throw new AppError('Release the vehicle or complete maintenance before changing status', 409, 'CONFLICT');
      }
      doc.status = body.status;
    }

    if (body.registrationNumber) doc.registrationNumber = body.registrationNumber;
    assignDefined(doc, body, ['type', 'make', 'modelName', 'year', 'fuelType', 'notes']);
    if (body.odometer !== undefined) assertOdometer(doc, body.odometer);
    applyDocuments(doc, body.documents);
    await doc.save();
    if (!doc.currentAssignment) return doc;
    await doc.populate({ path: 'currentAssignment', populate: ASSIGNMENT_POPULATE });
    return doc;
  },

  async remove(id) {
    const doc = await getMutable(id);
    if (doc.status === 'assigned' || doc.currentAssignment) {
      throw new AppError('Release the vehicle before deleting it', 409, 'CONFLICT');
    }
    await Promise.all([
      Assignment.deleteMany({ vehicle: doc._id }),
      Maintenance.deleteMany({ vehicle: doc._id }),
      FuelLog.deleteMany({ vehicle: doc._id }),
    ]);
    await doc.deleteOne();
  },

  async alerts(query) {
    const horizon = addDays(new Date(), query.withinDays);
    const vehicles = await Vehicle.find({
      $or: DOCUMENT_EXPIRY_FIELDS.map((field) => ({
        [`documents.${field}`]: { $ne: null, $lte: horizon },
      })),
    }).sort({ registrationNumber: 1 });

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
    if (vehicle.status !== 'available') {
      throw new AppError('Only an available vehicle can be assigned', 409, 'CONFLICT');
    }

    const { site, driver } = await loadAssignmentTargets(body);

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
        { path: 'vehicle', select: 'code registrationNumber type status make modelName' },
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
    const vehicle = await getMutable(id);
    if (vehicle.status === 'assigned') {
      throw new AppError('Release the vehicle before sending it for maintenance', 409, 'CONFLICT');
    }
    if (vehicle.status === 'inactive') {
      throw new AppError('Inactive vehicles cannot be sent for maintenance', 400, 'BAD_REQUEST');
    }

    const category = await requireDoc(
      MaintenanceCategory,
      body.maintenanceCategoryId,
      'Maintenance category'
    );
    if (category.status !== 'active') {
      throw new AppError('Maintenance category is inactive', 400, 'BAD_REQUEST');
    }

    const amount = body.amount;
    if (body.recordExpense && !(amount > 0)) {
      throw new AppError('A recorded expense needs an amount greater than zero', 400, 'BAD_REQUEST');
    }

    const date = body.date || new Date();
    const description = body.description || `${category.name} — ${body.paidTo}`;

    let expense;
    if (body.recordExpense) {
      expense = await recordExpense({
        category: 'vehicle',
        amount,
        expenseDate: date,
        vehicleId: vehicle.id,
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
        nextDueDate: body.nextDueDate,
        expense: expense && expense._id,
      });
      vehicle.status = 'maintenance';
      await vehicle.save();
      return log.populate('maintenanceCategory', 'name description status');
    } catch (error) {
      await voidExpense(expense);
      throw error;
    }
  },

  async listAllMaintenance(query) {
    console.log('listAllMaintenance query', query);
    const filter = {};
    if (query.vehicleId) filter.vehicle = query.vehicleId;
    if (query.maintenanceCategoryId) filter.maintenanceCategory = query.maintenanceCategoryId;
    if (query.from || query.to) {
      filter.date = {};
      if (query.from) filter.date.$gte = startOfUtcDay(query.from);
      if (query.to) filter.date.$lte = endOfUtcDay(query.to);
    }
    if (query.search) {
      const pattern = containsRegex(query.search);
      filter.$or = [{ paidTo: pattern }, { reference: pattern }, { description: pattern }];
    }

    console.log('listAllMaintenance filter', filter);
    const result = await new BaseRepository(Maintenance).paginate({
      filter,
      page: query.page,
      limit: query.limit,
      sort: parseSort(query.sort, MAINTENANCE_SORT, { date: -1 }),
      populate: MAINTENANCE_POPULATE,
    });
    result.items = await presentMaintenanceList(result.items);
    // console.log('listAllMaintenance result', JSON.stringify({
    //   count: result.items.length,
    //   meta: result.meta,
    //   items: result.items,
    // }, null, 2));
    return result;
  },

  async listMaintenance(id, query) {
    await getMutable(id);
    return this.listAllMaintenance({ ...query, vehicleId: id });
  },

  async updateMaintenance(id, maintenanceId, body, user) {
    const filter = { _id: maintenanceId };
    if (id) filter.vehicle = id;
    const log = await Maintenance.findOne(filter);
    if (!log) throw new AppError('Maintenance log not found', 404, 'NOT_FOUND');

    if (body.maintenanceCategoryId) {
      const category = await requireDoc(
        MaintenanceCategory,
        body.maintenanceCategoryId,
        'Maintenance category'
      );
      if (category.status !== 'active') {
        throw new AppError('Maintenance category is inactive', 400, 'BAD_REQUEST');
      }
      log.maintenanceCategory = category._id;
      if (!body.description && !log.description) {
        log.description = `${category.name} — ${body.paidTo || log.paidTo}`;
      }
    }

    assignDefined(log, body, ['paidTo', 'date', 'amount', 'modeOfPayment', 'reference', 'description']);
    if (Object.prototype.hasOwnProperty.call(body, 'nextDueDate')) {
      log.nextDueDate = body.nextDueDate || undefined;
    }

    if (log.completedAt && log.date && log.completedAt < log.date) {
      throw new AppError('Maintenance date cannot be after the completion time', 400, 'BAD_REQUEST');
    }

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
        vehicleId: log.vehicle.toString(),
        payeeName: body.payeeName || log.paidTo || 'Maintenance vendor',
        description: log.description || 'Vehicle maintenance',
        paymentModeNote: body.paymentModeNote || log.modeOfPayment,
      }, user);
      log.expense = expense._id;
    }

    await log.save();
    await log.populate(MAINTENANCE_POPULATE);
    return presentMaintenance(log);
  },

  async completeMaintenance(id, maintenanceId, body) {
    const vehicle = await getMutable(id);
    const log = await Maintenance.findOne({ _id: maintenanceId, vehicle: id });
    if (!log) throw new AppError('Maintenance log not found', 404, 'NOT_FOUND');
    if (log.completedAt) throw new AppError('Maintenance is already complete', 400, 'BAD_REQUEST');

    const completedAt = body.completedAt || new Date();
    if (log.date && completedAt < log.date) {
      throw new AppError('Completion time must be on or after the maintenance date', 400, 'BAD_REQUEST');
    }

    log.completedAt = completedAt;
    log.completionNote = body.completionNote || '';
    await log.save();

    const stillOpen = await Maintenance.exists({
      vehicle: id,
      completedAt: null,
      _id: { $ne: log._id },
    });

    if (!stillOpen && vehicle.status === 'maintenance') {
      vehicle.status = 'available';
      await vehicle.save();
    }

    return log;
  },

  async addFuel(id, body, user) {
    const vehicle = await getMutable(id);
    if (vehicle.status === 'inactive') {
      throw new AppError('Inactive vehicles cannot take fuel logs', 400, 'BAD_REQUEST');
    }
    assertOdometer(vehicle, body.odometer);

    let site;
    if (body.siteId) {
      site = await requireDoc(Site, body.siteId, 'Site');
    }

    let expense;
    if (body.recordExpense) {
      expense = await recordExpense({
        category: 'vehicle',
        amount: body.amount,
        expenseDate: body.loggedAt || new Date(),
        vehicleId: vehicle.id,
        siteId: body.siteId,
        projectId: site ? String(site.project) : undefined,
        payeeName: body.payeeName || 'Fuel vendor',
        description: body.remarks && body.remarks.length >= 3
          ? body.remarks
          : `Fuel for ${vehicle.registrationNumber}`,
        paymentModeNote: body.paymentModeNote,
      }, user);
    }

    try {
      const log = await FuelLog.create({
        vehicle: vehicle._id,
        loggedAt: body.loggedAt || new Date(),
        liters: body.liters,
        amount: body.amount,
        odometer: body.odometer,
        site: body.siteId,
        project: site && site.project,
        remarks: body.remarks || '',
        expense: expense && expense._id,
      });
      await vehicle.save();
      return log;
    } catch (error) {
      await voidExpense(expense);
      throw error;
    }
  },

  async listFuel(id, query) {
    await getMutable(id);
    return new BaseRepository(FuelLog).paginate({
      filter: { vehicle: id },
      page: query.page,
      limit: query.limit,
      sort: { loggedAt: -1 },
      populate: [{ path: 'site', select: 'name code' }],
    });
  },
};

module.exports = service;
