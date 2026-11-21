const express = require('express');
const NameMapping = require('../models/NameMapping');
const Employee = require('../models/Employee');
const AttendanceRecord = require('../models/AttendanceRecord');
const PenaltyRecord = require('../models/PenaltyRecord');

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
        const mappings = await NameMapping.find().sort({ empId: 1 }).lean();
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

        const existingAliasMapping = await NameMapping.findOne({
            empId: { $ne: cleanEmpId },
            aliases: { $regex: '^' + escapeRegex(cleanAlias) + '$', $options: 'i' }
        });

        if (existingAliasMapping) {
            return res.status(409).json({
                error: 'This alias is already mapped to another employee.'
            });
        }

if (!mapping) {
    mapping = new NameMapping({ employeeName: cleanName, empId: cleanEmpId, aliases: [cleanAlias] });
} else {
    mapping.employeeName = cleanName;
    const alreadyExists = mapping.aliases.some(
        a => a.trim().toLowerCase() === cleanAlias.toLowerCase()
    );
    if (alreadyExists) {
        return res.status(409).json({ error: 'This alias is already mapped to this employee.' });
    }
    mapping.aliases.push(cleanAlias);
}
        await mapping.save();

        await AttendanceRecord.updateMany(
            {
                $or: [
                    { originalName: { $regex: '^' + escapeRegex(cleanAlias) + '$', $options: 'i' } },
                    { name: { $regex: '^' + escapeRegex(cleanAlias) + '$', $options: 'i' } }
                ]
            },
            {
                $set: {
                    employeeId: cleanEmpId,
                    name: cleanName,
                    originalName: cleanAlias
                }
            }
        );

        await PenaltyRecord.updateMany(
            {
                $or: [
                    { originalName: { $regex: '^' + escapeRegex(cleanAlias) + '$', $options: 'i' } },
                    { name: { $regex: '^' + escapeRegex(cleanAlias) + '$', $options: 'i' } }
                ]
            },
            {
                $set: {
                    employeeId: cleanEmpId,
                    name: cleanName,
                    originalName: cleanAlias
                }
            }
        );

        res.json({ success: true, mapping });
    } catch (e) {
        if (e.code === 11000) return res.status(409).json({ error: 'Duplicate mapping.' });
        next(e);
    }
});

router.get('/unmapped', async (req, res, next) => {
    try {
        // Get unique unmapped names from Attendance and Penalty
        const attNames = await AttendanceRecord.distinct('name', { employeeId: { $regex: '^unmapped_' } });
        const penNames = await PenaltyRecord.distinct('name', { employeeId: { $regex: '^unmapped_' } });
        
const allUnmapped = [...new Set([...attNames, ...penNames])];
res.json({ success: true, unmappedNames: allUnmapped });
    } catch (e) { next(e); }
});

router.put('/:empId', async (req, res, next) => {
    try {
        const { oldAlias, newAlias } = req.body;
        const empId = req.params.empId;
        const cleanOldAlias = String(oldAlias || '').trim();
        const cleanNewAlias = String(newAlias || '').trim();

        if (!cleanOldAlias || !cleanNewAlias) {
            return res.status(400).json({ error: 'oldAlias and newAlias required.' });
        }

        const mapping = await NameMapping.findOne({ empId });
        if (!mapping) return res.status(404).json({ error: 'Mapping not found.' });

const oldAliasExists = mapping.aliases.some(
    a => a.toLowerCase() === cleanOldAlias.toLowerCase()
);

if (!oldAliasExists) {
    return res.status(404).json({ error: 'Old alias not found in this employee mapping.' });
}

        const existingAliasMapping = await NameMapping.findOne({
            empId: { $ne: empId },
            aliases: { $regex: '^' + escapeRegex(cleanNewAlias) + '$', $options: 'i' }
        });

        if (existingAliasMapping) {
            return res.status(409).json({
                error: 'This alias is already mapped to another employee.'
            });
        }

        const duplicateInSameEmployee = mapping.aliases.some(
            a => a.toLowerCase() === cleanNewAlias.toLowerCase() &&
                 a.toLowerCase() !== cleanOldAlias.toLowerCase()
        );

        if (duplicateInSameEmployee) {
            return res.status(409).json({
                error: 'This alias already exists for this employee.'
            });
        }

        mapping.aliases = mapping.aliases.map(a =>
            a.toLowerCase() === cleanOldAlias.toLowerCase() ? cleanNewAlias : a
        );

        await mapping.save({ validateBeforeSave: false });

        await AttendanceRecord.updateMany(
            {
                employeeId: empId,
                originalName: { $regex: '^' + escapeRegex(cleanOldAlias) + '$', $options: 'i' }
            },
            { $set: { originalName: cleanNewAlias } }
        );

        await PenaltyRecord.updateMany(
            {
                employeeId: empId,
                originalName: { $regex: '^' + escapeRegex(cleanOldAlias) + '$', $options: 'i' }
            },
            { $set: { originalName: cleanNewAlias } }
        );

        res.json({ success: true, mapping });
    } catch (e) {
        if (e.code === 11000) return res.status(409).json({ error: 'Duplicate mapping.' });
        next(e);
    }
});

router.delete('/:empId/alias/:alias', async (req, res, next) => {
    try {
        const mapping = await NameMapping.findOne({ empId: req.params.empId });
        if (!mapping) return res.status(404).json({ error: 'Mapping not found.' });
        
        // 👇 FIX: Revert Attendance and Penalty records back to unmapped
        const aliasToRemove = req.params.alias;
        const cleanAlias = String(aliasToRemove || '').trim();
if (!cleanAlias) {
    return res.status(400).json({ error: 'Alias is required.' });
}


        const unmappedId = `unmapped_${Buffer.from(cleanAlias, 'utf8').toString('hex')}`;
        
        await AttendanceRecord.updateMany(
            {
                originalName: { $regex: '^' + escapeRegex(aliasToRemove) + '$', $options: 'i' },
                employeeId: req.params.empId
            },
            {
                $set: {
                    name: aliasToRemove,
                    employeeId: unmappedId
                }
            }
        );

        await PenaltyRecord.updateMany(
            {
                originalName: { $regex: '^' + escapeRegex(aliasToRemove) + '$', $options: 'i' },
                employeeId: req.params.empId
            },
            {
                $set: {
                    name: aliasToRemove,
                    employeeId: unmappedId
                }
            }
        );

        mapping.aliases = mapping.aliases.filter(
    a => a.trim().toLowerCase() !== cleanAlias.toLowerCase()
);
        if (mapping.aliases.length === 0) {
            await NameMapping.deleteOne({ _id: mapping._id });
        } else {
            await mapping.save({ validateBeforeSave: false });
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
