const mongoose = require('mongoose');

const NameMappingSchema = new mongoose.Schema({
    employeeName: { type: String, required: true, index: true },
    empId: { type: String, required: true, index: true, unique: true },
    aliases: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('NameMapping', NameMappingSchema);
