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
const { normalizeDateSequence, createNameResolver } = require('../parsers/attendanceUtils');

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

async function autoAppendAliases(messages, mappings, employees) {
    const allNames = employees.map(e => e.name).filter(Boolean);
    const resolver = createNameResolver(allNames, mappings);
    const newAliasesMap = new Map();

    for (const msg of messages) {
        const sender = String(msg.sender || '').trim();
        // Skip phone numbers
        if (!sender || sender.includes('+91') || sender.includes('+')) continue;
        
        // Try to resolve the sender name to an employee
        const resolvedName = resolver.resolveOriginal(sender);
        if (!resolvedName) continue;
        
        const emp = employees.find(e => e.name === resolvedName);
        if (!emp) continue;
        
        // Skip if sender is exactly the employee's name
        if (sender.toLowerCase() === emp.name.toLowerCase()) continue;
        
        const existingMapping = mappings.find(m => String(m.empId) === String(emp.id));
        const existingAliases = existingMapping ? existingMapping.aliases : [];
        
        // Skip if sender is already an alias
        if (existingAliases.some(a => a.toLowerCase() === sender.toLowerCase())) continue;
        
        if (!newAliasesMap.has(emp.id)) newAliasesMap.set(emp.id, new Set());
        newAliasesMap.get(emp.id).add(sender);
    }

    for (const [empId, aliases] of newAliasesMap.entries()) {
        const emp = employees.find(e => String(e.id) === String(empId));
        let mapping = await NameMapping.findOne({ empId: String(empId) });
        
        if (!mapping) {
            mapping = new NameMapping({
                empId: String(empId),
                employeeName: emp.name,
                aliases: []
            });
        }
        
        let changed = false;
        aliases.forEach(alias => {
            if (!mapping.aliases.includes(alias)) {
                mapping.aliases.push(alias);
                changed = true;
            }
        });
        
        if (changed) {
            await mapping.save({ validateBeforeSave: false });
        }

        // 👇 ADD THIS: Update existing Attendance and Penalty records instantly
        for (const alias of aliases) {
            await AttendanceRecord.updateMany(
                { name: { $regex: `^${escapeRegex(alias)}$`, $options: 'i' } },
                { $set: { employeeId: String(empId) } }
            );
            await PenaltyRecord.updateMany(
                { name: { $regex: `^${escapeRegex(alias)}$`, $options: 'i' } },
                { $set: { employeeId: String(empId) } }
            );
        }
    }
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

            const rawDates = messages.map(m => m.date);
            const normalizedDates = normalizeDateSequence(rawDates);
            messages.forEach((m, i) => {
                m.date = normalizedDates[i];
            });

            attendanceData = parseAttendance(messages, undefined, employeeNames, mappingPayload);
            penaltyData = parsePenalty(messages, undefined, employeeNames, mappingPayload);
            
        } catch (parseErr) {
            // 👇 FIX: Properly close the catch block here
            return res.status(500).json({ error: 'Parser failed: ' + parseErr.message });
        }

        // 👇 THIS CODE SHOULD BE OUTSIDE THE TRY-CATCH
        const attendanceRecords = convertAttendance(attendanceData, mappings);
        const penaltyRecords = convertPenalty(penaltyData, mappings);
        await autoAppendAliases(messages, mappings, employees);

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
    } catch (e) { 
        next(e); 
    }
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


