const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const impressSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    date: { type: Date, required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    given: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, trim: true, maxlength: 300 },
    voidedAt: { type: Date },
  },
  { timestamps: true, collection: COLLECTIONS.impressEntries }
);

impressSchema.index({ employee: 1, date: -1 });
impressSchema.index({ site: 1, date: -1 });

applyJson(impressSchema);

module.exports = mongoose.model('Impress', impressSchema);
