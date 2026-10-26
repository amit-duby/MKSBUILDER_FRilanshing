const mongoose = require('mongoose');
const { COLLECTIONS, UNITS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const itemSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true, maxlength: 40, index: true },
    unit: { type: String, enum: UNITS, required: true },
    reorderLevel: { type: Number, required: true, min: 0, default: 0 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: COLLECTIONS.inventoryItems }
);

applyJson(itemSchema);

module.exports = mongoose.model('InventoryItem', itemSchema);
