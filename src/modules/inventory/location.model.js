const mongoose = require('mongoose');
const { COLLECTIONS, STOCK_LOCATION_TYPES } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const stockLocationSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: STOCK_LOCATION_TYPES, required: true, index: true },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', unique: true, sparse: true },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: COLLECTIONS.stockLocations }
);

applyJson(stockLocationSchema);

module.exports = mongoose.model('StockLocation', stockLocationSchema);
