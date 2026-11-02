const mongoose = require('mongoose');
const { COLLECTIONS, PAYMENT_MODE_NOTES } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const maintenanceSchema = new mongoose.Schema(
  {
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaintenanceCategory',
      required: true,
      index: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    singleImage: { type: String, trim: true, maxlength: 500, default: null },
    paidTo: { type: String, required: true, trim: true, maxlength: 120 },
    amountType: { type: String, enum: PAYMENT_MODE_NOTES, required: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, index: true },
    referenceNo: { type: String, trim: true, maxlength: 80, default: '' },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: COLLECTIONS.vehicleMaintenance }
);

applyJson(maintenanceSchema);

module.exports = mongoose.model('VehicleMaintenance', maintenanceSchema);
