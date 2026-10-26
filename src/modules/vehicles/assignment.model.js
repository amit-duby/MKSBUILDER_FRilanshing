const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const assignmentSchema = new mongoose.Schema(
  {
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true,
      index: true,
    },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    assignedAt: { type: Date, required: true },
    releasedAt: { type: Date, default: null },
    remarks: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true, collection: COLLECTIONS.vehicleAssignments }
);

assignmentSchema.index({ vehicle: 1, assignedAt: -1 });
assignmentSchema.index({ project: 1, releasedAt: 1 });
assignmentSchema.index({ site: 1, releasedAt: 1 });

applyJson(assignmentSchema);

module.exports = mongoose.model('VehicleAssignment', assignmentSchema);
