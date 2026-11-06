const mongoose = require('mongoose');
const { COLLECTIONS, MAINTENANCE_CATEGORY_STATUS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const maintenanceCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, unique: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    status: {
      type: String,
      enum: MAINTENANCE_CATEGORY_STATUS,
      default: 'active',
      index: true,
    },
  },
  { timestamps: true, collection: COLLECTIONS.vehicleMaintenanceCategories }
);

applyJson(maintenanceCategorySchema);

module.exports = mongoose.model('VehicleMaintenanceCategory', maintenanceCategorySchema);
