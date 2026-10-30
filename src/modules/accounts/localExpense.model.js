const mongoose = require('mongoose');
const { COLLECTIONS, PAYMENT_MODE_NOTES } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const localExpenseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    date: { type: Date, required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    cashGiven: { type: Number, required: true, min: 0 },
    expenseDetails: { type: String, required: true, trim: true, maxlength: 1000 },
    returnAmount: { type: Number, required: true, min: 0, default: 0 },
    paymentMode: { type: String, enum: PAYMENT_MODE_NOTES, required: true },
    receipt: { type: String, trim: true, maxlength: 500, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isVoid: { type: Boolean, default: false, index: true },
    voidReason: { type: String, trim: true, maxlength: 300 },
    voidedAt: { type: Date },
  },
  { timestamps: true, collection: COLLECTIONS.localExpenses }
);

localExpenseSchema.index({ employee: 1, date: -1 });
localExpenseSchema.index({ site: 1, date: -1 });

applyJson(localExpenseSchema);

module.exports = mongoose.model('LocalExpense', localExpenseSchema);
