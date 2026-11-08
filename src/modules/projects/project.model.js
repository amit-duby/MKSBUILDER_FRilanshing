const mongoose = require('mongoose');
const { COLLECTIONS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, trim: true, maxlength: 80, default: '', index: true },
  },
  { timestamps: true, collection: COLLECTIONS.projects }
);

applyJson(projectSchema);

module.exports = mongoose.model('Project', projectSchema);
