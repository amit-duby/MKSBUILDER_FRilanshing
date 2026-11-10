const mongoose = require('mongoose');
const { COLLECTIONS, PAY_BASIS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const payrollPaymentSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
    periodMonth: { type: Number, required: true, min: 1, max: 12, index: true },
    periodYear: { type: Number, required: true, min: 2000, max: 2100, index: true },
    payBasis: { type: String, enum: PAY_BASIS, required: true },
    daysPresent: { type: Number, required: true, min: 0, default: 0 },
    daysInPeriod: { type: Number, required: true, min: 0, default: 0 },
    basic: { type: Number, required: true, min: 0, default: 0 },
    extraShifts: { type: Number, required: true, min: 0, default: 0 },
    advanceRecovery: { type: Number, required: true, min: 0, default: 0 },
    netPay: { type: Number, required: true, default: 0 },
    paidAt: { type: Date, required: true, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: COLLECTIONS.payrollPayments }
);

payrollPaymentSchema.index(
  { employee: 1, periodMonth: 1, periodYear: 1 },
  { unique: true }
);

applyJson(payrollPaymentSchema);

module.exports = mongoose.model('PayrollPayment', payrollPaymentSchema);
