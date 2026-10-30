const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const advanceSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    monthlySalary: { type: Number, required: true, min: 0 },
    requestDate: { type: Date, required: true, index: true },
    advanceAmount: { type: Number, required: true, min: 0 },
    recoveredAmount: { type: Number, required: true, min: 0, default: 0 },
    recoveries: {
      type: [{
        amount: { type: Number, required: true, min: 0 },
        recoveredAt: { type: Date, required: true },
        remarks: { type: String, trim: true, maxlength: 300, default: '' },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      }],
      default: [],
    },
    reasonForAdvance: { type: String, required: true, trim: true, maxlength: 500 },
    attachment: { type: String, trim: true, maxlength: 500, default: null },
    employeeRemarks: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, trim: true, maxlength: 300 },
    voidedAt: { type: Date },
  },
  { timestamps: true, collection: COLLECTIONS.employeeAdvances }
);

advanceSchema.index({ employee: 1, requestDate: -1 });
advanceSchema.index({ department: 1, requestDate: -1 });

applyJson(advanceSchema);

module.exports = mongoose.model('EmployeeAdvance', advanceSchema);
