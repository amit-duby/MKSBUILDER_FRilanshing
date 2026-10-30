const mongoose = require('mongoose');
const {
  COLLECTIONS,
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUS,
  PAY_BASIS,
} = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const allowanceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const employeeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    designation: { type: String, required: true, trim: true, maxlength: 80 },
    idType: { type: String, trim: true, maxlength: 40, default: '' },
    idNumber: { type: String, trim: true, maxlength: 40, default: null },
    profilePhoto: { type: String, trim: true, maxlength: 500, default: null },
    idPhotos: { type: [{ type: String, trim: true, maxlength: 500 }], default: [] },
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      default: null,
      index: true,
    },
    bankName: { type: String, trim: true, maxlength: 120, default: '' },
    accountNumber: { type: String, trim: true, maxlength: 20, default: '' },
    ifscCode: { type: String, trim: true, uppercase: true, maxlength: 11, default: '' },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    status: { type: String, enum: EMPLOYEE_STATUS, default: 'active', index: true },
    joiningDate: { type: Date, required: true },
    relievingDate: { type: Date },
    salary: {
      payBasis: { type: String, enum: PAY_BASIS, default: 'monthly' },
      baseAmount: { type: Number, required: true, min: 0, default: 0 },
      allowances: { type: [allowanceSchema], default: [] },
    },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: COLLECTIONS.employees }
);

employeeSchema.index({ department: 1, status: 1 });
employeeSchema.index(
  { idNumber: 1 },
  { unique: true, partialFilterExpression: { idNumber: { $type: 'string' } } }
);

applyJson(employeeSchema);

module.exports = mongoose.model('Employee', employeeSchema);
