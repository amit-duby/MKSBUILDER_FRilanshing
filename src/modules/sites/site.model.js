const mongoose = require('mongoose');
const { COLLECTIONS, SITE_STATUS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const siteSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    city: { type: String, trim: true, maxlength: 80, default: '' },
    state: { type: String, trim: true, maxlength: 80, default: '' },
    pincode: { type: String, trim: true, maxlength: 12, default: '' },
    status: { type: String, enum: SITE_STATUS, default: 'active', index: true },
    incharge: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    startDate: { type: Date, required: true },
    expectedEndDate: { type: Date },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: COLLECTIONS.sites }
);

siteSchema.index({ project: 1, status: 1 });

applyJson(siteSchema);

module.exports = mongoose.model('Site', siteSchema);
