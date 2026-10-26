const mongoose = require('mongoose');
const { COLLECTIONS, EXPENSE_CATEGORIES, PAYMENT_MODE_NOTES } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const expenseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    expenseDate: { type: Date, required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    payeeName: { type: String, required: true, trim: true, maxlength: 120 },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
    referenceNo: { type: String, trim: true, maxlength: 80, default: '' },
    paymentModeNote: { type: String, enum: PAYMENT_MODE_NOTES },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, trim: true, maxlength: 300 },
    voidedAt: { type: Date },
  },
  { timestamps: true, collection: COLLECTIONS.expenses }
);

expenseSchema.index({ category: 1, expenseDate: -1 });

applyJson(expenseSchema);

module.exports = mongoose.model('Expense', expenseSchema);
