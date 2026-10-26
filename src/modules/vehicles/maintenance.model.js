const mongoose = require('mongoose');
const { COLLECTIONS, MAINTENANCE_TYPES } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const maintenanceSchema = new mongoose.Schema(
  {
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
      index: true,
    },
    loggedAt: { type: Date, required: true },
    type: { type: String, enum: MAINTENANCE_TYPES, required: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    cost: { type: Number, required: true, min: 0 },
    odometer: { type: Number, min: 0 },
    vendorName: { type: String, trim: true, maxlength: 120, default: '' },
    nextDueDate: { type: Date },
    completedAt: { type: Date },
    completionNote: { type: String, trim: true, maxlength: 500, default: '' },
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
  },
  { timestamps: true, collection: COLLECTIONS.vehicleMaintenance }
);

applyJson(maintenanceSchema);

module.exports = mongoose.model('VehicleMaintenance', maintenanceSchema);
