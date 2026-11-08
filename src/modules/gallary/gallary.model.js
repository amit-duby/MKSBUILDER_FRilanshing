const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const gallarySchema = new mongoose.Schema(
  {
    image: { type: String, trim: true, default: null },
    date: { type: Date, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
  },
  { timestamps: true, collection: COLLECTIONS.gallary }
);

gallarySchema.index({ name: 1, date: -1 });

applyJson(gallarySchema);

module.exports = mongoose.model('Gallary', gallarySchema);
