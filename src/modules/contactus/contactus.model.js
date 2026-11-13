const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const contactUsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
    projectType: { type: String, required: true, trim: true, maxlength: 120 },
    details: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: true, collection: COLLECTIONS.contactUs }
);

contactUsSchema.index({ createdAt: -1 });
contactUsSchema.index({ email: 1, createdAt: -1 });

applyJson(contactUsSchema);

module.exports = mongoose.model('ContactUs', contactUsSchema);
