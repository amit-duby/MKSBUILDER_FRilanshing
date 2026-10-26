const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const fuelSchema = new mongoose.Schema(
  {
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
      index: true,
    },
    loggedAt: { type: Date, required: true },
    liters: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    odometer: { type: Number, min: 0 },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    remarks: { type: String, trim: true, maxlength: 300, default: '' },
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
  },
  { timestamps: true, collection: COLLECTIONS.vehicleFuel }
);

applyJson(fuelSchema);

module.exports = mongoose.model('VehicleFuelLog', fuelSchema);
