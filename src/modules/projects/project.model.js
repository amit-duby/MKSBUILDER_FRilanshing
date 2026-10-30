const mongoose = require('mongoose');
const { COLLECTIONS, PROJECT_STATUS, CURRENCY } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const projectSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    clientName: { type: String, required: true, trim: true, maxlength: 120 },
    clientPhone: { type: String, trim: true, maxlength: 20 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: PROJECT_STATUS, default: 'planning', index: true },
    startDate: { type: Date, required: true },
    expectedEndDate: { type: Date },
    actualEndDate: { type: Date },
    budgetAmount: { type: Number, min: 0 },
    clientAmount: { type: Number, min: 0 },
    clientPendingAmount: { type: Number },
    moneySpent: { type: Number, min: 0, default: 0 },
    currency: { type: String, default: CURRENCY },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    city: { type: String, trim: true, maxlength: 80, default: '' },
    state: { type: String, trim: true, maxlength: 80, default: '' },
    pincode: { type: String, trim: true, maxlength: 12, default: '' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: COLLECTIONS.projects }
);

applyJson(projectSchema);

module.exports = mongoose.model('Project', projectSchema);
