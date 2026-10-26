const mongoose = require('mongoose');
const { COLLECTIONS, PAY_BASIS, SALARY_RECORD_STATUS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const lineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const salarySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
    periodMonth: { type: Number, required: true, min: 1, max: 12 },
    periodYear: { type: Number, required: true, min: 2000, max: 2100 },
    payBasis: { type: String, enum: PAY_BASIS, required: true },
    baseAmount: { type: Number, required: true, min: 0 },
    allowances: { type: [lineSchema], default: [] },
    deductions: { type: [lineSchema], default: [] },
    extras: { type: [lineSchema], default: [] },
    grossAmount: { type: Number, required: true, min: 0 },
    totalDeductions: { type: Number, required: true, min: 0 },
    totalExtras: { type: Number, required: true, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, required: true, min: 0, default: 0 },
    balanceAmount: { type: Number, required: true },
    outstandingAmount: { type: Number, required: true, min: 0, default: 0 },
    overpaidAmount: { type: Number, required: true, min: 0, default: 0 },
    recordStatus: { type: String, enum: SALARY_RECORD_STATUS, default: 'draft', index: true },
    remarks: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, trim: true, maxlength: 300 },
    voidedAt: { type: Date },
  },
  { timestamps: true, collection: COLLECTIONS.salaryRecords }
);

salarySchema.index(
  { employee: 1, periodMonth: 1, periodYear: 1 },
  { unique: true, partialFilterExpression: { isVoid: false } }
);

applyJson(salarySchema);

module.exports = mongoose.model('SalaryRecord', salarySchema);
