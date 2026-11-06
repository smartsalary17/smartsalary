const mongoose = require('mongoose');

const AttendanceRecordSchema = new mongoose.Schema({
    date: { type: String, required: true, index: true },
    employeeId: { type: String, index: true },
    name: { type: String, required: true, index: true },
    status: { type: String, required: true },
    checkIn: { type: String, default: '' },
    checkOut: { type: String, default: '' },
    checkIns: { type: [String], default: [] },
    checkOuts: { type: [String], default: [] },
    workTime: { type: String, default: '' },
    halfDay: { type: String, default: 'No' },
    permission: { type: String, default: '-' },
    weekOff: { type: String, default: 'No' },
    source: { type: String, default: 'coco_analyze' },
    isCoco: { type: Boolean, default: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, default: 'admin' }
}, { timestamps: true });

AttendanceRecordSchema.index({ date: 1, employeeId: 1 }, { unique: true, sparse: true });
AttendanceRecordSchema.index({ name: 1, date: 1 });

module.exports = mongoose.model('AttendanceRecord', AttendanceRecordSchema);
