const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const impressAmountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    date: { type: Date, required: true, index: true },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    givenTo: { type: String, required: true, trim: true, maxlength: 120 },
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      required: true,
      index: true,
    },
    note: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true, collection: COLLECTIONS.impressAmounts }
);

impressAmountSchema.index({ employee: 1, date: -1 });
impressAmountSchema.index({ site: 1, date: -1 });

applyJson(impressAmountSchema);

module.exports = mongoose.model('ImpressAmount', impressAmountSchema);
