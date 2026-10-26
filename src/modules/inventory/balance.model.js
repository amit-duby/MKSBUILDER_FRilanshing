const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const stockBalanceSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      required: true,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StockLocation',
      required: true,
    },
    quantity: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, collection: COLLECTIONS.stockBalances }
);

stockBalanceSchema.index({ item: 1, location: 1 }, { unique: true });

applyJson(stockBalanceSchema);

module.exports = mongoose.model('StockBalance', stockBalanceSchema);
