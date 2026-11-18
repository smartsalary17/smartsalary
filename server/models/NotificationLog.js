const mongoose = require('mongoose');

const NotificationLogSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    date: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['processing', 'sent', 'partial', 'no_subscriptions'],
        default: 'processing'
    },
    total: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 }
}, { timestamps: true });


module.exports = mongoose.model('NotificationLog', NotificationLogSchema);