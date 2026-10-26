const mongoose = require('mongoose');
const {
  COLLECTIONS,
  VEHICLE_STATUS,
  FUEL_TYPES,
} = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const vehicleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    type: { type: String, required: true, trim: true, maxlength: 40 },
    make: { type: String, trim: true, maxlength: 80, default: '' },
    modelName: { type: String, trim: true, maxlength: 80, default: '' },
    year: { type: Number, min: 1980, max: 2100 },
    fuelType: { type: String, enum: FUEL_TYPES, default: 'diesel' },
    status: { type: String, enum: VEHICLE_STATUS, default: 'available', index: true },
    currentAssignment: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleAssignment' },
    odometer: { type: Number, min: 0 },
    documents: {
      insuranceExpiry: Date,
      fitnessExpiry: Date,
      permitExpiry: Date,
      pollutionExpiry: Date,
    },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: COLLECTIONS.vehicles }
);

applyJson(vehicleSchema);

module.exports = mongoose.model('Vehicle', vehicleSchema);
