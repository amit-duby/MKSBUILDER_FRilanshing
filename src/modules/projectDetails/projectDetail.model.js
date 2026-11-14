const mongoose = require('mongoose');
const { COLLECTIONS, PROJECT_STATUS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const moneyEntrySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: true }
);

const projectDetailSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      unique: true,
      index: true,
    },
    clientName: { type: String, required: true, trim: true, maxlength: 120 },
    clientPhoneNo: { type: String, trim: true, maxlength: 20, default: '' },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: PROJECT_STATUS, default: 'planning', index: true },
    startDate: { type: Date, required: true },
    actualEndDate: { type: Date },
    budgetAmount: { type: Number, min: 0 },
    /** Sum of clientInstallments — kept in sync by the service */
    clientAmount: { type: Number, min: 0, default: 0 },
    clientPendingAmount: { type: Number },
    /** Sum of projectSpends — kept in sync by the service */
    moneySpend: { type: Number, min: 0, default: 0 },
    installmentType: { type: String, trim: true, maxlength: 120, default: '' },
    projectImage: { type: String, trim: true, default: null },
    bestProject: { type: Boolean, default: false, index: true },
    clientInstallments: { type: [moneyEntrySchema], default: [] },
    projectSpends: { type: [moneyEntrySchema], default: [] },
  },
  { timestamps: true, collection: COLLECTIONS.projectDetails }
);

projectDetailSchema.index({ status: 1, startDate: -1 });

applyJson(projectDetailSchema);

module.exports = mongoose.model('ProjectDetail', projectDetailSchema);
