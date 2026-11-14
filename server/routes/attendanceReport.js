const express = require('express');
const AttendanceRecord = require('../models/AttendanceRecord');
const { ensurePersistentStore, respondStorageUnavailable, shouldUseMockStore } = require('../config/db');

const router = express.Router();

router.get('/', async (req, res, next) => {
    try {
        if (!shouldUseMockStore() && !(await ensurePersistentStore())) {
            return await respondStorageUnavailable(res);
        }

        const { month, year, date, employeeId } = req.query;
        const filter = {};

        if (date) {
            filter.date = String(date);
        } else if (month && year) {
            const m = String(month).padStart(2, '0');
            filter.date = { $regex: '^' + year + '-' + m + '-' };
        }
        if (employeeId) filter.employeeId = String(employeeId);

        const records = await AttendanceRecord.find(filter).sort({ date: -1, name: 1 }).lean();
        const allDates = await AttendanceRecord.distinct('date');
        const availableMonths = Array.from(new Set(allDates.map(d => d.slice(0, 7)))).sort().reverse();

        const distinctNames = await AttendanceRecord.distinct('name');

        res.json({
            success: true,
            count: records.length,
            records,
            availableMonths,
            distinctNames
        });
    } catch (e) { next(e); }
});

router.delete('/', async (req, res, next) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'date is required.' });
        const result = await AttendanceRecord.deleteMany({ date: String(date) });
        res.json({ success: true, deleted: result.deletedCount });
    } catch (e) { next(e); }
});

module.exports = { route: router };
