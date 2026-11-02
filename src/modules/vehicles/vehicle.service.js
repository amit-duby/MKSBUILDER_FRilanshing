const AppError = require('../../common/errors/AppError');
const BaseRepository = require('../../common/repository/baseRepository');
const requireDoc = require('../../common/utils/requireDoc');
const { nextCode } = require('../../common/utils/sequence');
const {
  assignDefined,
  containsRegex,
  parseSort,
  addDays,
} = require('../../common/utils/helpers');
const { DOCUMENT_EXPIRY_FIELDS } = require('../../config/constants');
const Vehicle = require('./vehicle.model');
const Maintenance = require('./maintenance.model');
const MaintenanceCategory = require('./maintenanceCategory.model');
const Site = require('../sites/site.model');
const Employee = require('../employees/employee.model');

const repo = new BaseRepository(Vehicle);
const SORT_FIELDS = ['registrationNumber', 'code', 'type', 'status', 'createdAt'];
const VEHICLE_POPULATE = [
  { path: 'employee', select: 'fullName code designation status' },
  { path: 'site', select: 'name code status' },
];

async function getMutable(id) {
  const doc = await Vehicle.findById(id);
  if (!doc) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
  return doc;
}

async function present(id) {
  const doc = await Vehicle.findById(id).populate(VEHICLE_POPULATE);
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

function employeeIdFrom(body) {
  return body.employeeId || body.driverId;
}

async function loadVehicleLinks(body) {
  const employeeId = employeeIdFrom(body);
  const [site, employee] = await Promise.all([
    body.siteId ? requireDoc(Site, body.siteId, 'Site') : null,
    employeeId ? requireDoc(Employee, employeeId, 'Employee') : null,
  ]);
  return { site, employee };
}

const service = {
  async create(body) {
    const [code, links] = await Promise.all([
      nextCode('vehicle', 'VEH'),
      loadVehicleLinks(body),
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
      employee: links.employee ? links.employee._id : null,
      site: links.site ? links.site._id : null,
      odometer: body.odometer,
      documents: body.documents || {},
      notes: body.notes || '',
    });

    return present(vehicle.id);
  },

  async list(query) {
    const filter = {};
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.siteId) filter.site = query.siteId;
    if (query.employeeId) filter.employee = query.employeeId;
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
      populate: VEHICLE_POPULATE,
    });
  },

  getById(id) {
    return present(id);
  },

  async update(id, body) {
    const doc = await getMutable(id);
    if (body.status && body.status !== doc.status) {
      if (doc.status === 'maintenance') {
        throw new AppError('Complete maintenance before changing status', 409, 'CONFLICT');
      }
      doc.status = body.status;
    }

    if (body.registrationNumber) doc.registrationNumber = body.registrationNumber;
    assignDefined(doc, body, ['type', 'make', 'modelName', 'year', 'fuelType', 'notes']);
    if (body.odometer !== undefined) assertOdometer(doc, body.odometer);
    applyDocuments(doc, body.documents);

    if (Object.prototype.hasOwnProperty.call(body, 'siteId') || Object.prototype.hasOwnProperty.call(body, 'employeeId')) {
      const links = await loadVehicleLinks({
        siteId: Object.prototype.hasOwnProperty.call(body, 'siteId') ? body.siteId : undefined,
        employeeId: Object.prototype.hasOwnProperty.call(body, 'employeeId') ? body.employeeId : undefined,
      });
      if (Object.prototype.hasOwnProperty.call(body, 'siteId')) {
        doc.site = links.site ? links.site._id : null;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'employeeId')) {
        doc.employee = links.employee ? links.employee._id : null;
      }
    }

    await doc.save();
    return present(doc.id);
  },

  async remove(id) {
    const doc = await Vehicle.findById(id);
    if (!doc) throw new AppError('Vehicle not found', 404, 'NOT_FOUND');
    await Maintenance.deleteMany({ vehicle: doc._id });
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

  async addMaintenance(id, body) {
    const vehicle = await getMutable(id);
    if (vehicle.status === 'inactive') {
      throw new AppError('Inactive vehicles cannot be sent for maintenance', 400, 'BAD_REQUEST');
    }

    const category = await requireDoc(MaintenanceCategory, body.category, 'Maintenance category', {
      isActive: true,
    });

    const log = await Maintenance.create({
      vehicle: vehicle._id,
      category: category._id,
      description: body.description,
      singleImage: body.singleImage || null,
      paidTo: body.paidTo,
      amountType: body.amountType,
      amount: body.amount,
      date: body.date || new Date(),
      referenceNo: body.referenceNo || '',
    });
    vehicle.status = 'maintenance';
    await vehicle.save();
    return Maintenance.findById(log._id).populate({ path: 'category', select: 'name code isActive' });
  },

  async listMaintenance(id, query) {
    await getMutable(id);
    return new BaseRepository(Maintenance).paginate({
      filter: { vehicle: id },
      page: query.page,
      limit: query.limit,
      sort: { date: -1 },
      populate: [{ path: 'category', select: 'name code isActive' }],
    });
  },

  async completeMaintenance(id, maintenanceId, body) {
    const vehicle = await getMutable(id);
    const log = await Maintenance.findOne({ _id: maintenanceId, vehicle: id });
    if (!log) throw new AppError('Maintenance log not found', 404, 'NOT_FOUND');
    if (log.completedAt) throw new AppError('Maintenance is already complete', 400, 'BAD_REQUEST');

    const completedAt = body.completedAt || new Date();
    if (completedAt < log.date) {
      throw new AppError('Completion time must be on or after the log date', 400, 'BAD_REQUEST');
    }

    log.completedAt = completedAt;
    if (Object.prototype.hasOwnProperty.call(body, 'singleImage')) {
      log.singleImage = body.singleImage || null;
    }
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

    return log.populate({ path: 'category', select: 'name code isActive' });
  },

  async removeMaintenance(id, maintenanceId) {
    const vehicle = await getMutable(id);
    const log = await Maintenance.findOne({ _id: maintenanceId, vehicle: id });
    if (!log) throw new AppError('Maintenance log not found', 404, 'NOT_FOUND');
    await log.deleteOne();
    const stillOpen = await Maintenance.exists({ vehicle: id, completedAt: null });
    if (!stillOpen && vehicle.status === 'maintenance') {
      vehicle.status = 'available';
      await vehicle.save();
    }
  },
};

module.exports = service;
