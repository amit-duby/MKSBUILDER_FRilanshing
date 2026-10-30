const mongoose = require('mongoose');
const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  archivedFilter,
  containsRegex,
  parseSort,
  addDays,
} = require('../../common/utils/helpers');
const { COLLECTIONS, DOCUMENT_EXPIRY_FIELDS } = require('../../config/constants');
const Vehicle = require('./vehicle.model');
const Assignment = require('./assignment.model');
const Maintenance = require('./maintenance.model');
const FuelLog = require('./fuel.model');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');

const repo = new BaseRepository(Vehicle);
const SORT_FIELDS = ['registrationNumber', 'code', 'type', 'status', 'createdAt'];
const ASSIGNMENT_POPULATE = [
  { path: 'site', select: 'name code status' },
  { path: 'project', select: 'name code' },
  { path: 'driver', select: 'fullName code designation' },
];

function publicRef(doc) {
  if (!doc) return null;
  doc.id = doc._id.toString();
  delete doc._id;
  return doc;
}

async function getMutable(id) {
  const doc = await Vehicle.findById(id);
  if (!doc || doc.isDeleted) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
  return doc;
}

async function present(id) {
  const doc = await Vehicle.findById(id).populate({
    path: 'currentAssignment',
    populate: ASSIGNMENT_POPULATE,
  });
  if (!doc || doc.isDeleted) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
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
    requireDoc(Site, body.siteId, 'Site', { isDeleted: false }),
    body.driverId
      ? requireDoc(Employee, body.driverId, 'Employee', { isDeleted: false })
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
    project: site.project,
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
        project: targets.site.project,
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
    const filter = { ...archivedFilter(query) };
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
      populate: [{ path: 'currentAssignment', select: 'site project assignedAt releasedAt' }],
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
      throw new AppError('Release the vehicle before archiving it', 409, 'CONFLICT');
    }
    doc.isDeleted = true;
    doc.status = 'inactive';
    await doc.save();
  },

  async restore(id) {
    const doc = await Vehicle.findById(id);
    if (!doc) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
    if (!doc.isDeleted) throw new AppError('Vehicle is already active', 400, 'BAD_REQUEST');
    doc.isDeleted = false;
    doc.status = 'available';
    doc.currentAssignment = undefined;
    await doc.save();
    return doc;
  },

  async alerts(query) {
    const horizon = addDays(new Date(), query.withinDays);
    const vehicles = await Vehicle.find({
      isDeleted: false,
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
      project: site.project,
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

  async listAssignments(id, query) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError('Invalid identifier', 400, 'BAD_REQUEST');
    }

    const vehicleId = new mongoose.Types.ObjectId(id);
    const page = query.page;
    const limit = query.limit;
    const [vehicle, rows] = await Promise.all([
      Vehicle.exists({ _id: vehicleId, isDeleted: false }),
      Assignment.aggregate([
        { $match: { vehicle: vehicleId } },
        { $sort: { assignedAt: -1 } },
        {
          $facet: {
            items: [
              { $skip: (page - 1) * limit },
              { $limit: limit },
              {
                $lookup: {
                  from: COLLECTIONS.sites,
                  localField: 'site',
                  foreignField: '_id',
                  pipeline: [{ $project: { name: 1, code: 1, status: 1 } }],
                  as: 'site',
                },
              },
              {
                $lookup: {
                  from: COLLECTIONS.projects,
                  localField: 'project',
                  foreignField: '_id',
                  pipeline: [{ $project: { name: 1, code: 1 } }],
                  as: 'project',
                },
              },
              {
                $lookup: {
                  from: COLLECTIONS.employees,
                  localField: 'driver',
                  foreignField: '_id',
                  pipeline: [{ $project: { fullName: 1, code: 1, designation: 1 } }],
                  as: 'driver',
                },
              },
              {
                $set: {
                  site: { $first: '$site' },
                  project: { $first: '$project' },
                  driver: { $first: '$driver' },
                },
              },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ]),
    ]);

    if (!vehicle) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');

    const row = rows[0] || { items: [], total: [] };
    const total = row.total[0] ? row.total[0].count : 0;
    return {
      items: row.items.map((doc) => {
        doc.id = doc._id.toString();
        delete doc._id;
        delete doc.__v;
        doc.site = publicRef(doc.site);
        doc.project = publicRef(doc.project);
        doc.driver = publicRef(doc.driver);
        return doc;
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 1 : Math.ceil(total / limit),
      },
    };
  },

  async addMaintenance(id, body, user) {
    const vehicle = await getMutable(id);
    if (vehicle.status === 'assigned') {
      throw new AppError('Release the vehicle before sending it for maintenance', 409, 'CONFLICT');
    }
    if (vehicle.status === 'inactive') {
      throw new AppError('Inactive vehicles cannot be sent for maintenance', 400, 'BAD_REQUEST');
    }
    assertOdometer(vehicle, body.odometer);
    if (body.recordExpense && !(body.cost > 0)) {
      throw new AppError('A recorded expense needs an amount greater than zero', 400, 'BAD_REQUEST');
    }

    let expense;
    if (body.recordExpense) {
      expense = await recordExpense({
        category: 'vehicle',
        amount: body.cost,
        expenseDate: body.loggedAt || new Date(),
        vehicleId: vehicle.id,
        payeeName: body.payeeName || body.vendorName || 'Maintenance vendor',
        description: body.description,
        paymentModeNote: body.paymentModeNote,
      }, user);
    }

    try {
      const log = await Maintenance.create({
        vehicle: vehicle._id,
        loggedAt: body.loggedAt || new Date(),
        type: body.type,
        description: body.description,
        cost: body.cost,
        odometer: body.odometer,
        vendorName: body.vendorName || '',
        nextDueDate: body.nextDueDate,
        expense: expense && expense._id,
      });
      vehicle.status = 'maintenance';
      await vehicle.save();
      return log;
    } catch (error) {
      await voidExpense(expense);
      throw error;
    }
  },

  async listMaintenance(id, query) {
    await getMutable(id);
    return new BaseRepository(Maintenance).paginate({
      filter: { vehicle: id },
      page: query.page,
      limit: query.limit,
      sort: { loggedAt: -1 },
    });
  },

  async completeMaintenance(id, maintenanceId, body) {
    const vehicle = await getMutable(id);
    const log = await Maintenance.findOne({ _id: maintenanceId, vehicle: id });
    if (!log) throw new AppError('Maintenance log not found', 404, 'NOT_FOUND');
    if (log.completedAt) throw new AppError('Maintenance is already complete', 400, 'BAD_REQUEST');

    const completedAt = body.completedAt || new Date();
    if (completedAt < log.loggedAt) {
      throw new AppError('Completion time must be on or after the log time', 400, 'BAD_REQUEST');
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
      site = await requireDoc(Site, body.siteId, 'Site', { isDeleted: false });
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
