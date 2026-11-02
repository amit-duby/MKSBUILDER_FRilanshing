const mongoose = require('mongoose');
const { COLLECTIONS, UNITS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const itemSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    units: { type: String, enum: UNITS, required: true, default: 'nos' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: COLLECTIONS.inventoryItems }
);

applyJson(itemSchema);

module.exports = mongoose.model('InventoryItem', itemSchema);
