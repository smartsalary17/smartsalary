const express = require('express');
const AttendanceRecord = require('../models/AttendanceRecord');
const PenaltyRecord = require('../models/PenaltyRecord');
const NameMapping = require('../models/NameMapping');
const Employee = require('../models/Employee');
const { ensurePersistentStore, respondStorageUnavailable, shouldUseMockStore } = require('../config/db');
const { convertAttendance, convertPenalty } = require('../utils/cocoFormat');

const { parseWhatsAppChat } = require('../parsers/whatsappParser');
const { parseAttendance } = require('../parsers/attendanceParser');
const { parsePenalty } = require('../parsers/penaltyParser');

const router = express.Router();

async function bulkUpsertAttendance(records) {
    if (!records.length) return 0;
    const ops = records.map(rec => ({
        updateOne: {
            filter: rec.employeeId
                ? { date: rec.date, employeeId: rec.employeeId }
                : { date: rec.date, name: rec.name },
            update: { $set: rec },
            upsert: true
        }
    }));
    const result = await AttendanceRecord.bulkWrite(ops, { ordered: false });
    return result.upsertedCount + result.modifiedCount;
}

async function bulkReplacePenalty(records) {
    if (!records.length) return 0;
    const affected = new Set();
    for (const rec of records) {
        affected.add(`${rec.name.toLowerCase()}|${rec.date}`);
    }
    const deleteOps = [...affected].map(key => {
        const [name, date] = key.split('|');
        return { name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' }, date };
    });
    if (deleteOps.length) {
        await PenaltyRecord.deleteMany({ $or: deleteOps });
    }
    await PenaltyRecord.insertMany(records, { ordered: false });
    return records.length;
}

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.post('/', async (req, res, next) => {
    try {
        const { text } = req.body;
        if (!text || !String(text).trim()) {
            return res.status(400).json({ error: 'text is required.' });
        }

        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        const employees = await Employee.find().select('id name').lean();
        const employeeNames = employees.map(e => e.name).filter(Boolean);
        const mappings = await NameMapping.find().lean();
        const mappingPayload = mappings.map(m => ({
            id: m._id, employeeName: m.employeeName, empId: m.empId, aliases: m.aliases || []
        }));

        let messages, attendanceData, penaltyData;
        try {
            messages = parseWhatsAppChat(text);
            if (!messages || messages.length === 0) {
                return res.status(422).json({ error: 'No valid WhatsApp messages found.' });
            }
            attendanceData = parseAttendance(messages, undefined, employeeNames, mappingPayload);
            penaltyData = parsePenalty(messages, undefined, employeeNames, mappingPayload);
        } catch (parseErr) {
            return res.status(500).json({ error: 'Parser failed: ' + parseErr.message });
        }

        const attendanceRecords = convertAttendance(attendanceData, mappings);
        const penaltyRecords = convertPenalty(penaltyData, mappings);

        const savedAttendance = await bulkUpsertAttendance(attendanceRecords);
        const savedPenalty = await bulkReplacePenalty(penaltyRecords);

        const io = req.app.get('io');
        if (io) io.emit('state_changed', { type: 'coco_import' });

        return res.json({
            success: true,
            attendanceRows: attendanceRecords.length,
            penaltyRows: penaltyRecords.length,
            savedAttendance,
            savedPenalty,
            meta: { rows: messages.length, attendanceRows: attendanceData.length, penaltyRows: penaltyData.length }
        });
    } catch (e) { next(e); }
});

// DELETE route (Attendance only, Penalty untouched)
router.delete('/', async (req, res, next) => {
    try {
        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }
        const atDel = await AttendanceRecord.deleteMany({ source: 'coco_analyze' });
        
        const io = req.app.get('io');
        if (io) io.emit('state_changed', { type: 'coco_import' });
        
        return res.json({ success: true, deletedAttendance: atDel.deletedCount });
    } catch (e) { next(e); }
});

// GET route to check if COCO data exists
router.get('/check', async (req, res, next) => {
    try {
        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }
        const count = await AttendanceRecord.countDocuments({ source: 'coco_analyze' });
        return res.json({ hasData: count > 0 });
    } catch (e) { next(e); }
});

module.exports = { route: router };


