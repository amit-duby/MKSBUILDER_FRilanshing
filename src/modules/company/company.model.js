const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const addressSchema = new mongoose.Schema(
  {
    addressLine1: { type: String, trim: true, maxlength: 200, default: '' },
    addressLine2: { type: String, trim: true, maxlength: 200, default: '' },
    city: { type: String, trim: true, maxlength: 80, default: '' },
    state: { type: String, trim: true, maxlength: 80, default: '' },
    pincode: { type: String, trim: true, maxlength: 12, default: '' },
    country: { type: String, trim: true, maxlength: 80, default: '' },
  },
  { _id: false }
);

const companySchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true, maxlength: 160 },
    logo: { type: String, default: null },
    businessType: { type: String, trim: true, maxlength: 120, default: '' },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    establishedYear: { type: Number, min: 1800, max: 2100 },

    contact: {
      email: { type: String, lowercase: true, trim: true, maxlength: 160, default: '' },
      phone: { type: String, trim: true, maxlength: 20, default: '' },
      alternatePhone: { type: String, trim: true, maxlength: 20, default: '' },
      website: { type: String, trim: true, maxlength: 200, default: '' },
    },

    registration: {
      gstin: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
      pan: { type: String, trim: true, uppercase: true, maxlength: 12, default: '' },
      cin: { type: String, trim: true, uppercase: true, maxlength: 30, default: '' },
      tan: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
      registrationNumber: { type: String, trim: true, maxlength: 60, default: '' },
    },

    registeredAddress: { type: addressSchema, default: () => ({}) },
    officeAddress: { type: addressSchema, default: () => ({}) },

    bankDetails: {
      bankName: { type: String, trim: true, maxlength: 120, default: '' },
      accountHolderName: { type: String, trim: true, maxlength: 120, default: '' },
      accountNumber: { type: String, trim: true, maxlength: 30, default: '' },
      ifscCode: { type: String, trim: true, uppercase: true, maxlength: 11, default: '' },
      branchName: { type: String, trim: true, maxlength: 120, default: '' },
    },
  },
  { timestamps: true, collection: COLLECTIONS.companies }
);

companySchema.index({ companyName: 1 });
companySchema.index({ createdAt: -1 });

applyJson(companySchema);

module.exports = mongoose.model('Company', companySchema);
