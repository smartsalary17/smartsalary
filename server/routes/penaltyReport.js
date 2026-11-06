const express = require('express');
const PenaltyRecord = require('../models/PenaltyRecord');
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

        const records = await PenaltyRecord.find(filter).sort({ date: -1, name: 1 }).lean();

        const byEmployee = new Map();
        for (const rec of records) {
            const key = String(rec.name || '').toLowerCase();
            const existing = byEmployee.get(key) || { name: rec.name, employeeId: rec.employeeId || null, total: 0, count: 0, reasons: new Set() };
            existing.total += Number(rec.penalty || 0);
            existing.count += 1;
            if (rec.penaltyReason) existing.reasons.add(rec.penaltyReason);
            byEmployee.set(key, existing);
        }
        const aggregated = Array.from(byEmployee.values()).map(e => ({
            name: e.name,
            employeeId: e.employeeId,
            total: e.total,
            count: e.count,
            reasons: Array.from(e.reasons).join(' | ')
        })).sort((a, b) => b.total - a.total);

        const allDates = await PenaltyRecord.distinct('date');
        const availableMonths = Array.from(new Set(allDates.map(d => d.slice(0, 7)))).sort().reverse();

        res.json({ success: true, count: records.length, records, aggregated, availableMonths });
    } catch (e) { next(e); }
});

router.delete('/', async (req, res, next) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'date is required.' });
        const result = await PenaltyRecord.deleteMany({ date: String(date) });
        res.json({ success: true, deleted: result.deletedCount });
    } catch (e) { next(e); }
});

module.exports = { route: router };
