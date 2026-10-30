const mongoose = require('mongoose');
const {
  COLLECTIONS,
  MOVEMENT_TYPES,
  ADJUSTMENT_DIRECTIONS,
  MATERIAL_CONDITIONS,
  PAYMENT_MODE_NOTES,
} = require('../../config/constants');
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
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    vehicleType: { type: mongoose.Schema.Types.ObjectId, index: true },
    unitCost: { type: Number, min: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },
    vendorName: { type: String, trim: true, maxlength: 120, default: '' },
    condition: { type: String, enum: MATERIAL_CONDITIONS },
    billNo: { type: String, trim: true, maxlength: 80, default: '' },
    challanNo: { type: String, trim: true, maxlength: 80, default: '' },
    materialReceiptPhoto: { type: String, trim: true, maxlength: 500, default: null },
    paymentMode: { type: String, enum: PAYMENT_MODE_NOTES },
    address: { type: String, trim: true, maxlength: 300, default: '' },
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
