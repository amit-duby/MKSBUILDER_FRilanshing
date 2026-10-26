const mongoose = require('mongoose');
const { COLLECTIONS, MOVEMENT_TYPES, ADJUSTMENT_DIRECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const movementSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true, index: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
    quantity: { type: Number, required: true, min: 0 },
    direction: { type: String, enum: ADJUSTMENT_DIRECTIONS },
    fromLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation' },
    toLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
    unitCost: { type: Number, min: 0 },
    movementDate: { type: Date, required: true, index: true },
    reference: { type: String, trim: true, maxlength: 80, default: '' },
    remarks: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: COLLECTIONS.stockMovements }
);

movementSchema.index({ fromLocation: 1, movementDate: -1 });
movementSchema.index({ toLocation: 1, movementDate: -1 });

applyJson(movementSchema);

module.exports = mongoose.model('StockMovement', movementSchema);
