const express = require('express');
const NameMapping = require('../models/NameMapping');
const Employee = require('../models/Employee');
const AttendanceRecord = require('../models/AttendanceRecord');
const { ensurePersistentStore, respondStorageUnavailable, shouldUseMockStore } = require('../config/db');

const router = express.Router();

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', async (req, res, next) => {
    try {
        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }
        const mappings = await NameMapping.find().sort({ employeeName: 1 }).lean();
        const employees = await Employee.find().select('id name').lean();
        res.json({ success: true, mappings, employees });
    } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
    try {
        const { employeeName, empId, alias } = req.body;
        const cleanName = String(employeeName || '').trim();
        const cleanEmpId = String(empId || '').trim();
        const cleanAlias = String(alias || '').trim();

        if (!cleanName || !cleanEmpId || !cleanAlias) {
            return res.status(400).json({ error: 'employeeName, empId, alias required.' });
        }

        let mapping = await NameMapping.findOne({ empId: cleanEmpId });
        if (!mapping) {
            mapping = new NameMapping({ employeeName: cleanName, empId: cleanEmpId, aliases: [cleanAlias] });
        } else if (!mapping.aliases.includes(cleanAlias)) {
            mapping.aliases.push(cleanAlias);
        }
        await mapping.save();

        await AttendanceRecord.updateMany(
            { name: { $regex: '^' + escapeRegex(cleanAlias) + '$', $options: 'i' }, employeeId: null },
            { $set: { employeeId: cleanEmpId } }
        ).catch(() => {});

        res.json({ success: true, mapping });
    } catch (e) {
        if (e.code === 11000) return res.status(409).json({ error: 'Duplicate mapping.' });
        next(e);
    }
});

router.put('/:empId', async (req, res, next) => {
    try {
        const { employeeName } = req.body;
        const mapping = await NameMapping.findOneAndUpdate(
            { empId: req.params.empId },
            { $set: { employeeName: String(employeeName || '').trim() } },
            { new: true }
        );
        if (!mapping) return res.status(404).json({ error: 'Mapping not found.' });
        res.json({ success: true, mapping });
    } catch (e) { next(e); }
});

router.delete('/:empId/alias/:alias', async (req, res, next) => {
    try {
        const mapping = await NameMapping.findOne({ empId: req.params.empId });
        if (!mapping) return res.status(404).json({ error: 'Mapping not found.' });
        mapping.aliases = mapping.aliases.filter(a => a !== req.params.alias);
        if (mapping.aliases.length === 0) {
            await NameMapping.deleteOne({ _id: mapping._id });
        } else {
            await mapping.save();
        }
        res.json({ success: true });
    } catch (e) { next(e); }
});

router.delete('/:empId', async (req, res, next) => {
    try {
        await NameMapping.deleteOne({ empId: req.params.empId });
        res.json({ success: true });
    } catch (e) { next(e); }
});

module.exports = { route: router };
