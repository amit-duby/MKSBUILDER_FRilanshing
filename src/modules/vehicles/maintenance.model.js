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
    maintenanceCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleMaintenanceCategory',
      index: true,
    },
    paidTo: { type: String, trim: true, maxlength: 120, default: '' },
    date: { type: Date, index: true },
    amount: { type: Number, min: 0 },
    modeOfPayment: { type: String, enum: PAYMENT_MODE_NOTES },
    reference: { type: String, trim: true, maxlength: 80, default: '' },
    uploadReceipt: { type: String, trim: true, maxlength: 500, default: null },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    nextDueDate: { type: Date },
    completedAt: { type: Date },
    completionNote: { type: String, trim: true, maxlength: 500, default: '' },
    expense: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' },
  },
  { timestamps: true, collection: COLLECTIONS.vehicleMaintenance }
);

applyJson(maintenanceSchema);

module.exports = mongoose.model('VehicleMaintenance', maintenanceSchema);
