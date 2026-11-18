
const mongoose = require('mongoose');

const AttendanceReminderSettingSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        default: 'attendance-reminder'
    },
    enabled: {
        type: Boolean,
        default: true
    },
    hour: {
        type: Number,
        required: true,
        min: 0,
        max: 23
    },
    minute: {
        type: Number,
        required: true,
        min: 0,
        max: 59
    },
    timezone: {
        type: String,
        default: 'Asia/Kolkata'
    }
}, { timestamps: true });

module.exports = mongoose.model('AttendanceReminderSetting', AttendanceReminderSettingSchema);
