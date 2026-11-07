const mongoose = require('mongoose');
const { COLLECTIONS, VEHICLE_TYPE_STATUS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const vehicleTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, unique: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    status: {
      type: String,
      enum: VEHICLE_TYPE_STATUS,
      default: 'active',
      index: true,
    },
  },
  { timestamps: true, collection: COLLECTIONS.vehicleTypes }
);

applyJson(vehicleTypeSchema);

module.exports = mongoose.model('VehicleType', vehicleTypeSchema);
