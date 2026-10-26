const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const assignmentSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    isCurrent: { type: Boolean, default: true, index: true },
    remarks: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true, collection: COLLECTIONS.employeeAssignments }
);

assignmentSchema.index({ employee: 1, site: 1, isCurrent: 1 });

applyJson(assignmentSchema);

module.exports = mongoose.model('EmployeeAssignment', assignmentSchema);
