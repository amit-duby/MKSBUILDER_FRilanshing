const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const contactDetailsSchema = new mongoose.Schema(
  {
    firstPhone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
    secondPhone: { type: String, trim: true, maxlength: 20, default: null },
    address: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true, collection: COLLECTIONS.contactDetails }
);

contactDetailsSchema.index({ createdAt: -1 });

applyJson(contactDetailsSchema);

module.exports = mongoose.model('ContactDetails', contactDetailsSchema);
