const mongoose = require('mongoose');

const PenaltyRecordSchema = new mongoose.Schema({
    date: { type: String, required: true, index: true },
    employeeId: { type: String, index: true },
    name: { type: String, required: true, index: true },
    displayName: { type: String, default: '' },
    penalty: { type: Number, default: 0 },
    penaltyReason: { type: String, default: '' },
    source: { type: String, default: 'coco_penalty' },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, default: 'admin' }
}, { timestamps: true });

PenaltyRecordSchema.index({ name: 1, date: 1 });
PenaltyRecordSchema.index({ date: 1, employeeId: 1 });

module.exports = mongoose.model('PenaltyRecord', PenaltyRecordSchema);
