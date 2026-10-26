const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');

const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: COLLECTIONS.counters }
);

module.exports = mongoose.model('Counter', counterSchema);
