const mongoose = require('mongoose');
const { COLLECTIONS, PAYMENT_MODE_NOTES } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const localAmountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    date: { type: Date, required: true, index: true },
    impressAmount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ImpressAmount',
      required: true,
      index: true,
    },
    details: { type: String, required: true, trim: true, maxlength: 500 },
    returnAmount: { type: Number, required: true, min: 0 },
    paymentMode: { type: String, enum: PAYMENT_MODE_NOTES, required: true },
    uploadReceipt: { type: String, trim: true, default: null },
  },
  { timestamps: true, collection: COLLECTIONS.localAmounts }
);

localAmountSchema.index({ impressAmount: 1, date: -1 });

applyJson(localAmountSchema);

module.exports = mongoose.model('LocalAmount', localAmountSchema);
