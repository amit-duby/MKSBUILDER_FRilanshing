const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const maintenanceCategorySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: COLLECTIONS.vehicleMaintenanceCategories }
);

maintenanceCategorySchema.index({ name: 1 });
maintenanceCategorySchema.index({ isActive: 1, name: 1 });

applyJson(maintenanceCategorySchema);

module.exports = mongoose.model('MaintenanceCategory', maintenanceCategorySchema);
