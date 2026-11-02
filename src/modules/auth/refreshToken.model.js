const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
    revokedAt: { type: Date, default: null, index: true },
    replacedByHash: { type: String, select: false, default: null },
  },
  { timestamps: true, collection: COLLECTIONS.refreshTokens }
);

applyJson(refreshTokenSchema);

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
