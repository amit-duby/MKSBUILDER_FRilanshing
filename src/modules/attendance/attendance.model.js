const mongoose = require('mongoose');
const { COLLECTIONS, ATTENDANCE_STATUS } = require('../../config/constants');
const applyJson = require('../../common/utils/applyJson');

const attendanceSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    attendanceDate: { type: Date, required: true, index: true },
    status: { type: String, enum: ATTENDANCE_STATUS, required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    site: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', index: true },
    checkIn: { type: Date },
    checkOut: { type: Date },
    overtimeHours: { type: Number, min: 0, max: 16, default: 0 },
    remarks: { type: String, trim: true, maxlength: 300, default: '' },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: COLLECTIONS.attendance }
);

attendanceSchema.index({ employee: 1, attendanceDate: 1 }, { unique: true });
attendanceSchema.index({ attendanceDate: 1, site: 1 });

applyJson(attendanceSchema);

module.exports = mongoose.model('Attendance', attendanceSchema);
